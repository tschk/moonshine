import { expect, test } from "bun:test";
import {
  batch,
  collectDeps,
  createMemo,
  createSignal,
  createStore,
  getStoreRoot,
  subscribeInvalidation,
  hasValueDemand,
  trackDependency,
  type Trackable,
} from "../src/signal";
const noop = () => {};
const node = (read: () => unknown) => collectDeps(read)[0]!;
test("invalidation observation is lazy, repeated dirty writes preserve raw provenance and stop is idempotent", () => {
  const source = createSignal(1);
  let calls = 0;
  const memo = createMemo(() => {
    calls++;
    return source() * 2;
  });
  const dep = node(memo),
    raw = node(source);
  const marks: unknown[][] = [];
  const stop = subscribeInvalidation(dep, {
    invalidate(origin, version) {
      marks.push([origin === raw, version]);
    },
    notify() {
      marks.push(["notify"]);
    },
  });
  expect(calls).toBe(1);
  source.set(2);
  source.set(3);
  expect(calls).toBe(1);
  expect(marks.filter((x) => x[0] === true)).toHaveLength(2);
  expect(memo()).toBe(6);
  expect(calls).toBe(2);
  stop();
  stop();
  marks.length = 0;
  source.set(4);
  expect(marks).toEqual([]);
  expect(calls).toBe(2);
});
test("all diamond branches mark before value consumers or notifier pulls and equal values stay suppressed", () => {
  const source = createSignal(1);
  const a = createMemo(() => source() * 2),
    b = createMemo(() => source() * 3),
    sum = createMemo(() => a() + b());
  let left = false,
    right = false;
  const trace: string[] = [];
  const stops = [
    subscribeInvalidation(node(a), {
      invalidate() {
        left = true;
        trace.push("left");
      },
      notify() {
        expect(right).toBe(true);
        trace.push("wake-left");
      },
    }),
    subscribeInvalidation(node(b), {
      invalidate() {
        right = true;
        trace.push("right");
      },
      notify() {
        expect(left).toBe(true);
        trace.push("wake-right");
      },
    }),
  ];
  const seen: number[] = [];
  const valueStop = sum.subscribe(() => {
    expect(left && right).toBe(true);
    seen.push(sum());
  });
  source.set(2);
  expect(seen).toEqual([10]);
  expect(trace.slice(0, 2).toSorted()).toEqual(["left", "right"]);
  stops.forEach((stop) => stop());
  valueStop();
  const parity = createMemo(() => source() % 2);
  let values = 0,
    invalidations = 0;
  const stop = subscribeInvalidation(node(parity), {
    invalidate() {
      invalidations++;
    },
    notify() {},
  });
  const cancel = parity.subscribe(() => values++);
  source.set(4);
  expect(invalidations).toBe(1);
  expect(values).toBe(0);
  stop();
  cancel();
});
test("dynamic edges change only on validation and standalone validation does not publish another invalidation", () => {
  const flag = createSignal(true),
    a = createSignal(1),
    b = createSignal(10);
  let calls = 0;
  const memo = createMemo(() => {
    calls++;
    return flag() ? a() : b();
  });
  let marks = 0;
  const stop = subscribeInvalidation(node(memo), {
    invalidate() {
      marks++;
    },
    notify() {},
  });
  flag.set(false);
  expect(calls).toBe(1);
  expect(marks).toBe(1);
  expect(memo()).toBe(10);
  expect(marks).toBe(1);
  a.set(2);
  expect(marks).toBe(1);
  b.set(11);
  expect(marks).toBe(2);
  stop();
});
test("store writes, deletion, nested/array mutations and batching all use source commit", () => {
  const [store, set] = createStore({ x: 1, nested: { x: 1 }, items: [1] });
  let marks = 0;
  const stop = subscribeInvalidation(getStoreRoot(store)!, {
    invalidate() {
      marks++;
    },
    notify() {},
  });
  batch(() => {
    store.x = 2;
    store.nested.x = 2;
    store.items.push(2);
    delete (store as { x?: number }).x;
    set((s) => {
      s.nested.x = 3;
    });
  });
  expect(marks).toBe(5);
  stop();
});
test("mark errors drain mark, wake and ordinary peers and source remains committed", () => {
  const source = createSignal(1),
    dep = node(source),
    trace: string[] = [];
  const first = Error("first"),
    last = Error("last");
  const stops = [
    subscribeInvalidation(dep, {
      invalidate() {
        trace.push("bad-mark");
        throw first;
      },
      notify() {
        trace.push("bad-wake");
        throw last;
      },
    }),
    subscribeInvalidation(dep, {
      invalidate() {
        trace.push("good-mark");
      },
      notify() {
        trace.push("good-wake");
      },
    }),
    source.subscribe(() => {
      trace.push("value");
      throw last;
    }),
  ];
  expect(() => source.set(2)).toThrow(first);
  expect(source()).toBe(2);
  expect(trace).toEqual([
    "bad-mark",
    "good-mark",
    "bad-wake",
    "good-wake",
    "value",
  ]);
  stops.forEach((stop) => stop());
});
test("nested mark writes drain at outermost return and every mark precedes value pulls", () => {
  const a = createSignal(1),
    b = createSignal(1);
  const trace: string[] = [];
  const stops = [
    subscribeInvalidation(node(a), {
      invalidate() {
        trace.push("mark-a");
        b.set(2);
        trace.push("after-nested");
      },
      notify() {
        trace.push("wake-a");
      },
    }),
    subscribeInvalidation(node(b), {
      invalidate() {
        trace.push("mark-b");
      },
      notify() {
        trace.push("wake-b");
      },
    }),
    a.subscribe(() => trace.push("value-a")),
    b.subscribe(() => trace.push("value-b")),
  ];
  a.set(2);
  expect(trace).toEqual([
    "mark-a",
    "after-nested",
    "mark-b",
    "wake-a",
    "wake-b",
    "value-a",
    "value-b",
  ]);
  stops.forEach((stop) => stop());
});
test("foreign Trackables reject the protocol and immediately undo ordinary observation", () => {
  let active = 0;
  const foreign: Trackable = {
    version: 1,
    subscribe() {
      active++;
      return () => {
        active--;
      };
    },
  };
  expect(() =>
    subscribeInvalidation(foreign, {
      invalidate() {
        throw Error("never");
      },
      notify() {
        throw Error("never");
      },
    }),
  ).toThrow("does not support");
  expect(active).toBe(0);
});
test("ordinary sources remain synchronous after the registry exists but do not observe their graph", () => {
  const a = createSignal(0),
    b = createSignal(0);
  const trace: string[] = [];
  const stops = [
    a.subscribe(() => {
      trace.push("a-before");
      b.set(1);
      trace.push("a-after");
    }),
    b.subscribe(() => trace.push("b")),
  ];
  a.set(1);
  expect(trace).toEqual(["a-before", "b", "a-after"]);
  stops.forEach((stop) => stop());
});
test("disposal during marking cancels queued wakes and releases graph edges", () => {
  const source = createSignal(1),
    memo = createMemo(() => source() * 2);
  let wake = 0,
    marks = 0;
  let stop = noop;
  stop = subscribeInvalidation(node(memo), {
    invalidate() {
      marks++;
      stop();
    },
    notify() {
      wake++;
    },
  });
  source.set(2);
  source.set(3);
  expect(marks).toBe(1);
  expect(wake).toBe(0);
  expect(memo()).toBe(6);
});
test("failed initial activation and failed dynamic dependency protocol release acquired subscriptions", () => {
  const source = createSignal(1);
  const dep = node(source);
  const ordinary = dep.subscribe;
  let active = 0;
  dep.subscribe = (listener) => {
    active++;
    const stop = ordinary(listener);
    return () => {
      active--;
      stop();
    };
  };
  const initial = createMemo(() => source());
  expect(() =>
    subscribeInvalidation(node(initial), { invalidate() {}, notify() {} }),
  ).toThrow("does not support");
  expect(active).toBe(0);
  const flag = createSignal(true),
    good = createSignal(1);
  const dynamic = createMemo(() => (flag() ? good() : source()));
  let marks = 0;
  const stop = subscribeInvalidation(node(dynamic), {
    invalidate() {
      marks++;
    },
    notify() {},
  });
  flag.set(false);
  expect(() => dynamic()).toThrow("does not support");
  expect(active).toBe(0);
  stop();
  const count = marks;
  good.set(2);
  flag.set(true);
  source.set(2);
  expect(marks).toBe(count);
  dep.subscribe = ordinary;
});
test("initial computation failures retain no invalidation observation and retry normally", () => {
  const source = createSignal(1);
  let bad = true,
    calls = 0,
    marks = 0;
  const memo = createMemo(() => {
    calls++;
    const value = source();
    if (bad) throw Error("initial");
    return value;
  });
  expect(() =>
    subscribeInvalidation(
      {
        version: 0,
        subscribe() {
          throw Error("subscription");
        },
      },
      { invalidate() {}, notify() {} },
    ),
  ).toThrow("subscription");
  let dependency: Trackable | undefined;
  try {
    collectDeps(memo, (dep) => {
      dependency = dep;
    });
  } catch {}
  expect(dependency).toBeUndefined();
  bad = false;
  const dep = node(memo);
  const stop = subscribeInvalidation(dep, {
    invalidate() {
      marks++;
    },
    notify() {},
  });
  expect(calls).toBe(2);
  source.set(2);
  expect(calls).toBe(2);
  expect(marks).toBe(1);
  stop();
});
test("notify writes mark the new wave before its ordinary listeners and drain after errors", () => {
  const a = createSignal(0),
    b = createSignal(0);
  const trace: string[] = [];
  const error = Error("notify");
  const stops = [
    subscribeInvalidation(node(a), {
      invalidate() {
        trace.push("mark-a");
      },
      notify() {
        trace.push("wake-a");
        b.set(1);
        trace.push("wake-after-write");
        throw error;
      },
    }),
    subscribeInvalidation(node(b), {
      invalidate() {
        trace.push("mark-b");
      },
      notify() {
        trace.push("wake-b");
      },
    }),
    a.subscribe(() => trace.push("value-a")),
    b.subscribe(() => trace.push("value-b")),
  ];
  expect(() => a.set(1)).toThrow(error);
  expect(trace).toEqual([
    "mark-a",
    "wake-a",
    "mark-b",
    "wake-after-write",
    "wake-b",
    "value-a",
    "value-b",
  ]);
  expect([a(), b()]).toEqual([1, 1]);
  stops.forEach((stop) => stop());
});
test("separate origins while already dirty are all marked and batch coalesces existing value callbacks", () => {
  const source = createSignal(1);
  const memo = createMemo(() => source() * 2);
  const origins: number[] = [];
  let values = 0;
  const stop = subscribeInvalidation(node(memo), {
    invalidate(_, revision) {
      origins.push(revision);
    },
    notify() {},
  });
  const cancel = source.subscribe(() => values++);
  batch(() => {
    source.set(2);
    source.set(3);
  });
  expect(origins).toHaveLength(2);
  expect(origins[1]!).toBeGreaterThan(origins[0]!);
  expect(values).toBe(1);
  stop();
  cancel();
});
test("observation of an already-created dirty memo can throw without retaining any graph", () => {
  const source = createSignal(1);
  let bad = false,
    calls = 0,
    marks = 0;
  const memo = createMemo(() => {
    calls++;
    const value = source();
    if (bad) throw Error("observe");
    return value;
  });
  const dep = node(memo);
  bad = true;
  source.set(2);
  expect(() =>
    subscribeInvalidation(dep, {
      invalidate() {
        marks++;
      },
      notify() {},
    }),
  ).toThrow("observe");
  source.set(3);
  expect(marks).toBe(0);
  expect(calls).toBe(2);
  bad = false;
  const stop = subscribeInvalidation(dep, {
    invalidate() {
      marks++;
    },
    notify() {},
  });
  expect(calls).toBe(3);
  expect(memo()).toBe(3);
  stop();
});
test("inactive-origin writes during a mark are held until all active marks finish", () => {
  const active = createSignal(0),
    inactive = createSignal(0);
  const trace: string[] = [];
  const stops = [
    subscribeInvalidation(node(active), {
      invalidate() {
        trace.push("mark-first");
        inactive.set(1);
        trace.push("mark-after-write");
      },
      notify() {
        trace.push("wake-first");
      },
    }),
    subscribeInvalidation(node(active), {
      invalidate() {
        trace.push("mark-peer");
      },
      notify() {
        trace.push("wake-peer");
      },
    }),
    inactive.subscribe(() => trace.push("inactive-value")),
    active.subscribe(() => trace.push("active-value")),
  ];
  active.set(1);
  expect(trace).toEqual([
    "mark-first",
    "mark-after-write",
    "mark-peer",
    "wake-first",
    "wake-peer",
    "active-value",
    "inactive-value",
  ]);
  stops.forEach((stop) => stop());
});
test("bounded mark feedback stops before a finite 2005 producer and drains peers then recovers", () => {
  const source = createSignal(0);
  let producer = true,
    calls = 0,
    marks = 0,
    wakes = 0,
    values = 0;
  const stops = [
    subscribeInvalidation(node(source), {
      invalidate() {
        calls++;
        if (producer && calls < 2005) source.set(source.peek() + 1);
      },
      notify() {},
    }),
    subscribeInvalidation(node(source), {
      invalidate() {
        marks++;
      },
      notify() {
        wakes++;
      },
    }),
    source.subscribe(() => values++),
  ];
  expect(() => source.set(1)).toThrow("update limit");
  expect(calls).toBe(1000);
  expect(marks).toBe(1000);
  expect(wakes).toBe(1);
  expect(values).toBe(1000);
  producer = false;
  source.set(3000);
  expect([calls, marks, wakes, values]).toEqual([1001, 1001, 2, 1001]);
  expect(source()).toBe(3000);
  stops.forEach((stop) => stop());
});
test("bounded notify feedback preserves earlier errors and captured peers then recovers", () => {
  const source = createSignal(0);
  let producer = true,
    calls = 0,
    peer = 0,
    values = 0;
  const first = Error("primary");
  const stops = [
    subscribeInvalidation(node(source), {
      invalidate() {
        if (producer && calls === 0) throw first;
      },
      notify() {
        calls++;
        if (producer && calls < 2005) source.set(source.peek() + 1);
      },
    }),
    subscribeInvalidation(node(source), {
      invalidate() {},
      notify() {
        peer++;
      },
    }),
    source.subscribe(() => values++),
  ];
  expect(() => source.set(1)).toThrow(first);
  expect(calls).toBe(1000);
  expect(peer).toBe(500);
  expect(values).toBe(1000);
  producer = false;
  source.set(3000);
  expect([calls, peer, values]).toEqual([1001, 501, 1001]);
  stops.forEach((stop) => stop());
});
test("1500 independent observers and 1500 independent origins do not share a callback budget", () => {
  const source = createSignal(0);
  let marks = 0,
    wakes = 0;
  const stops = Array.from({ length: 1500 }, () =>
    subscribeInvalidation(node(source), {
      invalidate() {
        marks++;
      },
      notify() {
        wakes++;
      },
    }),
  );
  source.set(1);
  expect([marks, wakes]).toEqual([1500, 1500]);
  stops.forEach((stop) => stop());
  const origins = Array.from({ length: 1500 }, () => createSignal(0));
  let count = 0;
  const cancel = origins.map((value) =>
    subscribeInvalidation(node(value), {
      invalidate() {
        count++;
      },
      notify() {},
    }),
  );
  const trigger = createSignal(0);
  const stop = subscribeInvalidation(node(trigger), {
    invalidate() {
      for (const value of origins) value.set(1);
    },
    notify() {},
  });
  trigger.set(1);
  expect(count).toBe(1500);
  stop();
  cancel.forEach((dispose) => dispose());
});
test("1500 independent inputs feeding one observer share one causal generation", () => {
  const inputs = Array.from({ length: 1500 }, () => createSignal(0));
  let calls = 0;
  const total = createMemo(() => {
    calls++;
    return inputs.reduce((n, input) => n + input(), 0);
  });
  let marks = 0,
    wakes = 0;
  const stop = subscribeInvalidation(node(total), {
    invalidate() {
      marks++;
    },
    notify() {
      wakes++;
      expect(total()).toBe(1500);
    },
  });
  const driver = createSignal(0);
  const driverStop = subscribeInvalidation(node(driver), {
    invalidate() {},
    notify() {},
  });
  const stopValue = driver.subscribe(() => {
    for (const input of inputs) input.set(1);
    expect(calls).toBe(1);
  });
  driver.set(1);
  expect([marks, wakes, calls, total()]).toEqual([1500, 1, 2, 1500]);
  stop();
  driverStop();
  stopValue();
});
test("fresh source identities cannot evade causal feedback depth bounds", () => {
  for (const mode of ["mark", "notify", "value"] as const) {
    const stops: Array<() => void> = [];
    let calls = 0;
    function spawn() {
      const source = createSignal(0);
      if (mode === "value") {
        stops.push(
          subscribeInvalidation(node(source), { invalidate() {}, notify() {} }),
        );
        stops.push(
          source.subscribe(() => {
            calls++;
            if (calls < 2005) spawn();
          }),
        );
      } else
        stops.push(
          subscribeInvalidation(node(source), {
            invalidate() {
              if (mode === "mark") {
                calls++;
                if (calls < 2005) spawn();
              }
            },
            notify() {
              if (mode === "notify") {
                calls++;
                if (calls < 2005) spawn();
              }
            },
          }),
        );
      source.set(1);
    }
    expect(() => spawn()).toThrow("update limit");
    expect(calls).toBe(1000);
    stops.forEach((stop) => stop());
  }
  const recovery = createSignal(0);
  let called = 0;
  const stop = subscribeInvalidation(node(recovery), {
    invalidate() {
      called++;
    },
    notify() {},
  });
  recovery.set(1);
  expect(called).toBe(1);
  stop();
});
test("registration and disposal during marking use snapshots and only later origins see new observers", () => {
  const source = createSignal(0);
  const trace: string[] = [];
  let peerStop = noop,
    lateStop = noop;
  const firstStop = subscribeInvalidation(node(source), {
    invalidate() {
      trace.push("first-" + source.peek());
      if (source.peek() === 1) {
        peerStop();
        lateStop = subscribeInvalidation(node(source), {
          invalidate() {
            trace.push("late-" + source.peek());
          },
          notify() {
            trace.push("late-wake");
          },
        });
        source.set(2);
      }
    },
    notify() {
      trace.push("first-wake");
    },
  });
  peerStop = subscribeInvalidation(node(source), {
    invalidate() {
      trace.push("removed");
    },
    notify() {
      trace.push("removed-wake");
    },
  });
  source.set(1);
  expect(trace).toEqual([
    "first-1",
    "first-2",
    "late-2",
    "first-wake",
    "late-wake",
  ]);
  firstStop();
  peerStop();
  lateStop();
});
test("demand queries use protocol transport without validation or value registration", () => {
  const source = createSignal(1);
  let calls = 0;
  const memo = createMemo(() => {
    calls++;
    return source() * 2;
  });
  const dep = node(memo) as Parameters<typeof trackDependency>[0];
  const original = dep.subscribe;
  let normal = 0,
    closed = 0,
    protocol = 0;
  dep.subscribe = (...args: Parameters<typeof original>) => {
    const [listener, request] = args;
    if (request) protocol++;
    else normal++;
    const stop = original(listener, request);
    return request
      ? stop
      : () => {
          closed++;
          stop();
        };
  };
  source.set(2);
  const before = calls;
  expect(hasValueDemand(dep)).toBe(false);
  expect([calls, normal, closed]).toEqual([before, 0, 0]);
  const stop = dep.subscribe(noop);
  expect(hasValueDemand(dep)).toBe(true);
  expect([calls, normal, closed]).toEqual([before + 1, 1, 0]);
  stop();
  expect(hasValueDemand(dep)).toBe(false);
  expect([calls, normal, closed]).toEqual([before + 1, 1, 1]);
  expect(protocol).toBe(3);
});
test("private side observers are not demand but scheduled and normal parents are demand", () => {
  const source = createSignal(1),
    child = createMemo(() => source() * 2),
    parent = createMemo(() => child() + 1);
  const childNode = node(child),
    parentNode = node(parent);
  const side = subscribeInvalidation(childNode, {
    demand: false,
    invalidate() {},
    notify() {},
  });
  expect(hasValueDemand(childNode)).toBe(false);
  const scheduled = subscribeInvalidation(parentNode, {
    invalidate() {},
    notify() {},
  });
  expect(hasValueDemand(childNode)).toBe(true);
  scheduled();
  expect(hasValueDemand(childNode)).toBe(false);
  const value = parent.subscribe(noop);
  expect(hasValueDemand(childNode)).toBe(true);
  value();
  expect(hasValueDemand(childNode)).toBe(false);
  side();
  const raw = node(source);
  expect(hasValueDemand(raw)).toBe(false);
  const stop = source.subscribe(noop);
  expect(hasValueDemand(raw)).toBe(true);
  stop();
  expect(hasValueDemand(raw)).toBe(false);
});
test("demand follows current dynamic dependency edges and disconnects without evaluation", () => {
  const flag = createSignal(true),
    a = createMemo(() => 1),
    b = createMemo(() => 2),
    selected = createMemo(() => (flag() ? a() : b()));
  const an = node(a),
    bn = node(b),
    sn = node(selected);
  const sideA = subscribeInvalidation(an, {
      demand: false,
      invalidate() {},
      notify() {},
    }),
    sideB = subscribeInvalidation(bn, {
      demand: false,
      invalidate() {},
      notify() {},
    });
  const stop = subscribeInvalidation(sn, { invalidate() {}, notify() {} });
  expect([hasValueDemand(an), hasValueDemand(bn)]).toEqual([true, false]);
  flag.set(false);
  expect(selected()).toBe(2);
  expect([hasValueDemand(an), hasValueDemand(bn)]).toEqual([false, true]);
  stop();
  expect([hasValueDemand(an), hasValueDemand(bn)]).toEqual([false, false]);
  sideA();
  sideB();
});
test("ignored demand protocol stops a foreign subscription and preserves protocol error over unsubscribe error", () => {
  let active = 0;
  const foreign: Trackable = {
    version: 1,
    subscribe() {
      active++;
      return () => {
        active--;
        throw Error("stop");
      };
    },
  };
  expect(() => hasValueDemand(foreign)).toThrow(
    "does not support demand inspection",
  );
  expect(active).toBe(0);
  expect(() =>
    subscribeInvalidation(foreign, { invalidate() {}, notify() {} }),
  ).toThrow("does not support invalidation observation");
  expect(active).toBe(0);
});
