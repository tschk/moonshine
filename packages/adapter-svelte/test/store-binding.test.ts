import { test, expect } from "bun:test";
import { createRoot, createComputed } from "@tschk/moonshine-dom/reactive";
import { renderToString, h } from "@tschk/moonshine-dom/ssr";
import { createStoreReference } from "../src/store-binding";
import { writable } from "../src/store";
test("subscription is lazy, initial multiple emissions and function values are literal", () => {
  const fn = () => 3;
  let starts = 0,
    stops = 0,
    stop!: () => void;
  const store = {
    subscribe(run: any) {
      starts++;
      run(1);
      run(fn);
      return () => stops++;
    },
  };
  let ref: any;
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
  });
  expect(starts).toBe(0);
  expect(ref.get(store)).toBe(fn);
  expect(ref.get(store)).toBe(fn);
  expect(starts).toBe(1);
  stop();
  expect(stops).toBe(1);
});
test("same object notifications remain reactive and unrelated start reads are untracked", () => {
  const raw = { n: 0 },
    store = writable(raw);
  let runs = 0,
    stop!: () => void;
  createRoot((d) => {
    stop = d;
    const ref = createStoreReference<typeof raw>();
    createComputed(() => {
      ref.get(store);
      runs++;
    });
  });
  expect(runs).toBe(1);
  raw.n = 1;
  store.set(raw);
  expect(runs).toBe(2);
  stop();
  store.set(raw);
  expect(runs).toBe(2);
});
test("switch hook releases hidden source immediately and replacement subscribes lazily", () => {
  const trace: string[] = [];
  const make = (id: string, value: number) => ({
    subscribe(run: any) {
      trace.push("start" + id);
      run(value);
      return () => trace.push("stop" + id);
    },
  });
  const a = make("a", 1),
    b = make("b", 2);
  let ref: any, stop!: () => void;
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
  });
  expect(ref.get(a)).toBe(1);
  ref.releaseIfChanged(b);
  expect(trace).toEqual(["starta", "stopa"]);
  expect(ref.get(b)).toBe(2);
  expect(ref.get(null)).toBeUndefined();
  expect(ref.get(undefined)).toBeUndefined();
  expect(trace).toEqual(["starta", "stopa", "startb", "stopb"]);
  stop();
});
test("observable receiver and cleanup remain idempotent", () => {
  let stops = 0,
    stop!: () => void;
  const release = {
    unsubscribe() {
      expect(this).toBe(release);
      stops++;
    },
  };
  const store = {
    subscribe(run: any) {
      run(4);
      return release;
    },
  };
  createRoot((d) => {
    stop = d;
    const ref = createStoreReference<number>();
    expect(ref.get(store)).toBe(4);
    ref.releaseIfChanged(null);
    ref.releaseIfChanged(null);
  });
  stop();
  stop();
  expect(stops).toBe(1);
});
test("SSR caches per-request subscription and releases at request disposal", () => {
  const trace: string[] = [];
  const store = {
    subscribe(run: any) {
      trace.push("start");
      run("<unsafe>");
      return () => trace.push("stop");
    },
  };
  for (let i = 0; i < 2; i++) {
    const html = renderToString(() => {
      const ref = createStoreReference<string>();
      return h(
        "b",
        null,
        () => ref.get(store),
        () => ref.get(store),
      );
    });
    expect(html).toBe("<b>&lt;unsafe&gt;&lt;unsafe&gt;</b>");
    expect(trace).toEqual(
      Array.from({ length: i + 1 }, () => ["start", "stop"]).flat(),
    );
  }
});
test("owner disposal during synchronous subscription immediately closes returned subscription", () => {
  let stops = 0,
    stop!: () => void;
  const store = {
    subscribe(run: any) {
      run(1);
      stop();
      return () => stops++;
    },
  };
  let ref: any;
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
  });
  ref.get(store);
  expect(stops).toBe(1);
});
test("cleanup throws once, peers drain, disposed retained reads use temporary subscription", () => {
  const trace: string[] = [];
  let stop!: () => void, ref: any;
  const broken = {
    subscribe(run: any) {
      run(1);
      return () => {
        trace.push("bad");
        throw Error("cleanup");
      };
    },
  };
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
    ref.get(broken);
    const peer = createStoreReference();
    peer.get({
      subscribe(run: any) {
        run(2);
        return () => trace.push("peer");
      },
    });
  });
  expect(stop).toThrow("cleanup");
  expect(trace).toEqual(["bad", "peer"]);
  stop();
  expect(trace).toEqual(["bad", "peer"]);
  let starts = 0,
    ends = 0;
  expect(
    ref.get({
      subscribe(run: any) {
        starts++;
        run(3);
        return () => ends++;
      },
    }),
  ).toBe(3);
  expect([starts, ends]).toEqual([1, 1]);
});
test("hidden A to B to A keeps official cached identity and closed null reads retain cache", () => {
  const trace: string[] = [];
  const make = (id: string, value: number) => ({
    subscribe(run: any) {
      trace.push("start" + id);
      run(value);
      return () => trace.push("stop" + id);
    },
  });
  const a = make("a", 1),
    b = make("b", 2);
  let stop!: () => void, ref: any;
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
  });
  ref.get(a);
  expect(ref.releaseIfChanged(b)).toBe(b);
  ref.releaseIfChanged(a);
  expect(ref.get(a)).toBe(1);
  expect(trace).toEqual(["starta", "stopa"]);
  stop();
  expect(ref.get(null)).toBe(1);
  expect(ref.get(undefined)).toBe(1);
});
test("subscribe throws after emission preserves cached same-store retry behavior", () => {
  let calls = 0,
    stop!: () => void,
    ref: any;
  const store = {
    subscribe(run: any) {
      calls++;
      run(4);
      throw Error("subscribe");
    },
  };
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
  });
  expect(() => ref.get(store)).toThrow("subscribe");
  expect(ref.get(store)).toBe(4);
  expect(calls).toBe(1);
  stop();
});
test("protocol-violating callbacks after unsubscribe cannot overwrite replacement or disposed cache", () => {
  let retained!: (value: number) => void, stop!: () => void, ref: any;
  const a = {
      subscribe(run: any) {
        retained = run;
        run(1);
        return () => {};
      },
    },
    b = {
      subscribe(run: any) {
        run(2);
        return () => {};
      },
    };
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
  });
  ref.get(a);
  ref.get(b);
  retained(9);
  expect(ref.get(b)).toBe(2);
  stop();
  retained(10);
  expect(ref.get(null)).toBe(2);
});
test("malformed cleanup reports on release once using shared normalizer", () => {
  let stop!: () => void, ref: any;
  createRoot((d) => {
    stop = d;
    ref = createStoreReference();
  });
  expect(
    ref.get({
      subscribe(run: any) {
        run(3);
        return 4;
      },
    }),
  ).toBe(3);
  expect(stop).toThrow(
    "Store subscription must return a function or unsubscribe object",
  );
  expect(stop).not.toThrow();
});
test("subscribe startup reads do not become consumer dependencies", () => {
  const source = writable(1);
  let stop!: () => void,
    runs = 0;
  const other = writable(1);
  let noise = 0;
  const store = {
    subscribe(run: any) {
      other.subscribe((value) => (noise = value))();
      return source.subscribe(run);
    },
  };
  createRoot((d) => {
    stop = d;
    const ref = createStoreReference<number>();
    createComputed(() => {
      ref.get(store);
      runs++;
    });
  });
  other.set(2);
  expect(runs).toBe(1);
  expect(noise).toBe(1);
  stop();
});
test("finish reproduces child unsubscribe before parent destroy without transient reads", async () => {
  const { onCleanup } = await import("@tschk/moonshine-dom/reactive");
  const { createComponent } = await import("@tschk/moonshine-dom/component");
  const trace: unknown[] = [];
  const make = (id: string) => ({
    subscribe(run: any) {
      trace.push("start:" + id);
      run(4);
      return () => trace.push("stop:" + id);
    },
  });
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    const ref = createStoreReference(),
      store = make("parent");
    onCleanup(() => trace.push(["parent-destroy", ref.get(store)]));
    createComponent(
      () => {
        const ref = createStoreReference(),
          store = make("child");
        onCleanup(() => trace.push(["destroy", ref.get(store)]));
        ref.get(store);
        ref.finish();
        return undefined;
      },
      {},
      "dom",
    );
    ref.get(store);
    ref.finish();
  });
  stop();
  expect(trace).toEqual([
    "start:child",
    "start:parent",
    ["destroy", 4],
    "stop:child",
    ["parent-destroy", 4],
    "stop:parent",
  ]);
});
test("onDestroy can mutate then read subscribed store before finish cleanup", async () => {
  const { onCleanup } = await import("@tschk/moonshine-dom/reactive");
  const store = writable(1),
    trace: unknown[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    const ref = createStoreReference<number>();
    ref.get(store);
    onCleanup(() => {
      trace.push(ref.get(store));
      store.set(2);
      trace.push(ref.get(store));
    });
    ref.finish();
  });
  stop();
  expect(trace).toEqual([1, 2]);
});
test("failed setup before finish releases once through fallback", () => {
  let starts = 0,
    stops = 0;
  const store = {
    subscribe(run: any) {
      starts++;
      run(1);
      return () => stops++;
    },
  };
  expect(() =>
    createRoot(() => {
      const ref = createStoreReference();
      ref.get(store);
      throw Error("setup");
    }),
  ).toThrow("setup");
  expect([starts, stops]).toEqual([1, 1]);
});
test("finish registers against creation owner despite a different live caller context", async () => {
  const { getOwner, runWithOwner } =
    await import("@tschk/moonshine-dom/reactive");
  let ref: any,
    firstStop!: () => void,
    otherStop!: () => void,
    otherOwner: any,
    stops = 0;
  createRoot((d) => {
    firstStop = d;
    ref = createStoreReference();
    ref.get({
      subscribe(run: any) {
        run(1);
        return () => stops++;
      },
    });
  });
  createRoot((d) => {
    otherStop = d;
    otherOwner = getOwner();
  });
  runWithOwner(otherOwner, () => {
    ref.finish();
    ref.finish();
  });
  otherStop();
  expect(stops).toBe(0);
  firstStop();
  firstStop();
  expect(stops).toBe(1);
});
test("finish cleanup failures drain peer references and cannot run twice", () => {
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    for (const id of ["a", "b"]) {
      const ref = createStoreReference();
      ref.get({
        subscribe(run: any) {
          run(1);
          return () => {
            trace.push(id);
            throw Error(id);
          };
        },
      });
      ref.finish();
      ref.finish();
    }
  });
  expect(stop).toThrow("a");
  expect(trace).toEqual(["a", "b"]);
  expect(stop).not.toThrow();
});
test("store history preserves first pre-flush values including cleanup-only dependencies in both effect modes", async () => {
  const { createRuneEffect } = await import("../src/effect");
  const { withRuneScheduler } = await import("../src/pre");
  for (const scheduled of [false, true]) {
    const a = writable(0),
      b = writable(10),
      trace: unknown[] = [];
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      const setup = () => {
        const first = createStoreReference<number>(),
          second = createStoreReference<number>();
        second.get(b);
        createRuneEffect(() => {
          trace.push(["run", first.get(a)]);
          return () => trace.push(["clean", first.get(a), second.get(b)]);
        });
        first.finish();
        second.finish();
      };
      if (scheduled) withRuneScheduler(setup);
      else setup();
    });
    await Promise.resolve();
    b.set(11);
    a.set(1);
    a.set(2);
    await Promise.resolve();
    stop();
    expect(trace).toEqual([
      ["run", 0],
      ["clean", 0, 10],
      ["run", 2],
      ["clean", 2, 11],
    ]);
  }
});
test("dynamic store switch cleanup observes prior selected store while new effect reads replacement", async () => {
  const { createRuneEffect } = await import("../src/effect");
  const { createRawState } = await import("../src/raw-state");
  const a = writable(1),
    b = writable(2),
    selected = createRawState(a),
    trace: unknown[] = [];
  let stop!: () => void, ref: any;
  createRoot((d) => {
    stop = d;
    ref = createStoreReference<number>();
    createRuneEffect(() => {
      trace.push(["run", ref.get(selected.value)]);
      return () => trace.push(["clean", ref.get(selected.value)]);
    });
    ref.finish();
  });
  await Promise.resolve();
  selected.value = ref.releaseIfChanged(b);
  await Promise.resolve();
  stop();
  expect(trace).toEqual([
    ["run", 1],
    ["clean", 1],
    ["run", 2],
    ["clean", 2],
  ]);
});
test("SSR retries release discarded subscriptions while only accepted public destroy runs", async () => {
  const { settle } = await import("@tschk/moonshine-dom/ssr");
  const { onDestroy } = await import("../src/svelte");
  const trace: unknown[] = [];
  let starts = 0,
    attempts = 0;
  const store = {
    subscribe(run: any) {
      const value = ++starts;
      trace.push(["start", value]);
      run("<" + value + ">");
      return () => trace.push(["stop", value]);
    },
  };
  function Component() {
    const ref = createStoreReference<string>();
    const value = ref.get(store);
    onDestroy(() => trace.push(["destroy", value]));
    ref.finish();
    return h("b", null, value);
  }
  const output = renderToString(() =>
    settle((invalidate) => {
      const child = h(Component);
      if (++attempts === 1) invalidate();
      return child;
    }),
  );
  expect(output).toBe("<b>&lt;2&gt;</b>");
  expect(trace).toEqual([
    ["start", 1],
    ["stop", 1],
    ["start", 2],
    ["destroy", "<2>"],
    ["stop", 2],
  ]);
});
test("unsubscribe reentrant reads use temporary subscriptions without leaking ownership", () => {
  const trace: string[] = [];
  let stop!: () => void, ref: any;
  const b = {
      subscribe(run: any) {
        trace.push("start:b");
        run("b");
        return () => trace.push("stop:b");
      },
    },
    c = {
      subscribe(run: any) {
        trace.push("start:c");
        run("c");
        return () => trace.push("stop:c");
      },
    };
  const a = {
    subscribe(run: any) {
      trace.push("start:a");
      run("a");
      return () => {
        trace.push("stop:a");
        expect(ref.get(a)).toBe("a");
        expect(ref.get(b)).toBe("b");
      };
    },
  };
  createRoot((d) => {
    stop = d;
    ref = createStoreReference<string>();
    ref.get(a);
    ref.finish();
  });
  expect(ref.get(c)).toBe("c");
  stop();
  expect(trace).toEqual([
    "start:a",
    "stop:a",
    "start:b",
    "stop:b",
    "start:c",
    "stop:c",
  ]);
});
test("disposal during unsubscribe prevents acquiring a replacement owner subscription", () => {
  const trace: string[] = [];
  let stop!: () => void, ref: any;
  const a = {
      subscribe(run: any) {
        trace.push("start:a");
        run(1);
        return () => {
          trace.push("stop:a");
          stop();
        };
      },
    },
    b = {
      subscribe(run: any) {
        trace.push("start:b");
        run(2);
        return () => trace.push("stop:b");
      },
    };
  createRoot((d) => {
    stop = d;
    ref = createStoreReference<number>();
    ref.get(a);
    ref.finish();
  });
  expect(ref.get(b)).toBe(2);
  stop();
  expect(trace).toEqual(["start:a", "stop:a", "start:b", "stop:b"]);
});
test("nested releases preserve the outer reentrant temporary-read guard after cleanup failure", () => {
  const trace: string[] = [];
  let stop!: () => void, ref: any;
  const b = {
      subscribe(run: any) {
        trace.push("start:b");
        run(2);
        return () => {
          trace.push("stop:b");
          throw Error("temporary");
        };
      },
    },
    c = {
      subscribe(run: any) {
        trace.push("start:c");
        run(3);
        return () => trace.push("stop:c");
      },
    };
  const a = {
    subscribe(run: any) {
      trace.push("start:a");
      run(1);
      return () => {
        trace.push("stop:a");
        ref.releaseIfChanged(c);
        expect(() => ref.get(b)).toThrow("temporary");
        expect(ref.get(c)).toBe(3);
      };
    },
  };
  createRoot((d) => {
    stop = d;
    ref = createStoreReference<number>();
    ref.get(a);
    ref.finish();
  });
  ref.releaseIfChanged(c);
  expect(trace).toEqual([
    "start:a",
    "stop:a",
    "start:b",
    "stop:b",
    "start:c",
    "stop:c",
  ]);
  stop();
  expect(trace).toEqual([
    "start:a",
    "stop:a",
    "start:b",
    "stop:b",
    "start:c",
    "stop:c",
  ]);
});
test("same-current reads during final unsubscribe return cache without recursively subscribing", () => {
  let starts = 0,
    ends = 0,
    stop!: () => void,
    ref: any;
  const a = {
    subscribe(run: any) {
      starts++;
      run(1);
      return () => {
        ends++;
        expect(ref.get(a)).toBe(1);
      };
    },
  };
  createRoot((d) => {
    stop = d;
    ref = createStoreReference<number>();
    ref.get(a);
    ref.finish();
  });
  stop();
  expect([starts, ends]).toEqual([1, 1]);
});

test("a hidden replacement subscribes during destroy and releases after the final read", async () => {
  const { createComponent } = await import("@tschk/moonshine-dom/component");
  const { createRawState } = await import("../src/raw-state");
  const { onDestroy, tick } = await import("../src/svelte");
  const trace: unknown[][] = [];
  let replace!: () => unknown;
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        let current: ReturnType<
          typeof createRawState<ReturnType<typeof store>>
        >;
        function store(name: string) {
          return {
            name,
            subscribe(run: (value: string) => void) {
              trace.push(["subscribe", name]);
              run(name);
              return () =>
                trace.push(["unsubscribe", name, current.value.name]);
            },
          };
        }
        const a = store("a"),
          b = store("b");
        current = createRawState(a);
        const reference = createStoreReference<string>();
        reference.get(current.value);
        function rhs() {
          trace.push(["rhs"]);
          return b;
        }
        function assign() {
          return reference.releaseIfChanged((current.value = rhs()));
        }
        replace = () => {
          const value = assign();
          trace.push(["result", value === b, current.value.name]);
          return value;
        };
        onDestroy(() => trace.push(["destroy", reference.get(current.value)]));
        reference.finish();
      },
      {},
      "dom",
    );
    return dispose;
  });
  replace();
  expect(trace).toEqual([
    ["subscribe", "a"],
    ["rhs"],
    ["unsubscribe", "a", "b"],
    ["result", true, "b"],
  ]);
  await tick();
  stop();
  stop();
  expect(trace).toEqual([
    ["subscribe", "a"],
    ["rhs"],
    ["unsubscribe", "a", "b"],
    ["result", true, "b"],
    ["subscribe", "b"],
    ["destroy", "b"],
    ["unsubscribe", "b", "b"],
  ]);
});
