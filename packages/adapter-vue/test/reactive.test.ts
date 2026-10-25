import { expect, test } from "bun:test";
import {
  batch,
  createComputed,
  createRoot,
  onAfterDispose,
  getOwner,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import {
  computed,
  reactive,
  ref,
  shallowRef,
  watch,
  toRef,
  unref,
  isRef,
} from "../src/reactive";

test("refs preserve identity, literal functions, and deep mutable tracking", () => {
  const value = ref({ nested: { count: 1 }, list: [1] });
  expect(ref(value)).toBe(value);
  const seen: number[] = [];
  createRoot((stop) => {
    createComputed(() => {
      seen.push(value.value.nested.count);
    });
    value.value.nested.count = 2;
    expect(seen).toEqual([1, 2]);
    stop();
  });
  const fn = () => value.value.nested.count,
    next = () => value.value.nested.count + 1;
  const callback = ref(fn);
  callback.value = next;
  expect(callback.value).toBe(next);
});

test("reactive caches proxies and unwraps object refs but retains array refs", () => {
  const count = ref(1);
  const source = { count, nested: { count }, list: [count] };
  const value = reactive(source);
  expect(reactive(source)).toBe(value);
  expect(reactive(value)).toBe(value);
  expect(value.nested).toBe(value.nested);
  expect(value.count).toBe(1);
  expect(value.list[0]).toBe(count);
  value.count = 2;
  expect(count.value).toBe(2);
  const replacement = ref(3);
  (value as any).count = replacement;
  expect(value.count).toBe(3);
  expect(count.value).toBe(2);
  value.list[0] = replacement;
  expect(value.list[0]).toBe(replacement);
});

test("reactive rejects unsupported roots and retains opaque nested instances", () => {
  for (const value of [new WeakMap(), new WeakSet(), new Date()])
    expect(() => reactive(value)).toThrow("plain object, array, Set or Map");
  const date = new Date();
  expect(reactive({ date }).date).toBe(date);
});

test("computed caches previous values, readonly writes reject, writable setters stay untracked", () => {
  createRoot((stop) => {
    const value = ref(1),
      unrelated = ref(0);
    const previous: Array<number | undefined> = [];
    const doubled = computed<number>((old) => {
      previous.push(old);
      return value.value * 2;
    });
    expect(doubled.value).toBe(2);
    expect(doubled.value).toBe(2);
    value.value = 2;
    expect(doubled.value).toBe(4);
    expect(previous).toEqual([undefined, 2]);
    expect(() => {
      (doubled as any).value = 8;
    }).toThrow("readonly");
    const writable = computed({
      get: () => value.value,
      set: (next: number) => {
        void unrelated.value;
        value.value = next;
      },
    });
    writable.value = 4;
    expect(value.value).toBe(4);
    stop();
  });
});

test("watch is lazy, compares derived values and invokes cleanup before reruns and stop", () => {
  const value = ref(1),
    events: string[] = [];
  const stop = watch(
    () => value.value % 2,
    (next, old, clean) => {
      events.push(`${old}->${next}`);
      clean(() => events.push("cleanup"));
    },
    { flush: "sync" },
  );
  value.value = 3;
  expect(events).toEqual([]);
  value.value = 4;
  value.value = 5;
  stop();
  stop();
  expect(events).toEqual(["1->0", "cleanup", "0->1", "cleanup"]);
  value.value = 6;
  expect(events).toHaveLength(4);
});

test("watch tuple immediate, callback reads untracked, native batches coalesce", () => {
  const first = ref(1),
    second = ref(2),
    unrelated = ref(0);
  const seen: unknown[] = [];
  const stop = watch(
    [first, () => second.value] as const,
    (next, old) => {
      void unrelated.value;
      seen.push([next, old]);
    },
    { flush: "sync", immediate: true },
  );
  unrelated.value++;
  batch(() => {
    first.value = 3;
    second.value = 4;
  });
  expect(seen).toEqual([
    [[1, 2], undefined],
    [
      [3, 4],
      [1, 2],
    ],
  ]);
  stop();
});

test("watch stops with its owner and cleanup reads do not subscribe its source", () => {
  const value = ref(1),
    unrelated = ref(0);
  let calls = 0,
    cleanups = 0;
  createRoot((stop) => {
    watch(
      value,
      (_next, _old, clean) => {
        calls++;
        clean(() => {
          void unrelated.value;
          cleanups++;
        });
      },
      { flush: "sync", immediate: true },
    );
    value.value = 2;
    unrelated.value++;
    expect(calls).toBe(2);
    stop();
  });
  value.value = 3;
  expect(calls).toBe(2);
  expect(cleanups).toBe(2);
});

test("watch rejects unsupported options before evaluating sources", () => {
  let reads = 0;
  for (const options of [
    undefined,
    {},
    { flush: "pre" },
    { flush: "post" },
    { flush: "sync", unknown: true },
    { flush: "sync", deep: "invalid" },
    { flush: "sync", deep: Number.NaN },
    { flush: "sync", once: "invalid" },
    { flush: "sync", immediate: "invalid" },
  ]) {
    expect(() =>
      watch(
        () => ++reads,
        () => {},
        options as any,
      ),
    ).toThrow("only flush");
  }
  expect(reads).toBe(0);
  expect(() => watch({} as any, () => {}, { flush: "sync" })).toThrow(
    "refs, reactive objects, or getters",
  );
});

test("ref deep conversion unwraps nested refs and computed setters do not track readers", () => {
  const ordinary = ref({ value: 1 });
  expect(ordinary.value.value).toBe(1);
  const nested = ref({ count: ref(2) });
  expect(nested.value.count).toBe(2);
  const unrelated = ref(1),
    output = ref(0);
  let runs = 0;
  createRoot((stop) => {
    const writable = computed({
      get: () => output.value,
      set: (next: number) => {
        void unrelated.value;
        output.value = next;
      },
    });
    createComputed(() => {
      runs++;
      writable.value = 3;
    });
    unrelated.value = 2;
    expect(runs).toBe(1);
    expect(output.value).toBe(3);
    stop();
  });
});

test("computed stays lazy through unread source changes and supports forward declarations", () => {
  const source = ref(1);
  let calls = 0;
  const doubled = computed(() => {
    calls++;
    return source.value * factor;
  });
  const factor = 2;
  expect(calls).toBe(0);
  source.value = 3;
  expect(calls).toBe(0);
  expect(doubled.value).toBe(6);
  expect(doubled.value).toBe(6);
  expect(calls).toBe(1);
  source.value = 4;
  expect(calls).toBe(1);
  expect(doubled.value).toBe(8);
  expect(calls).toBe(2);
});

test("computed equality suppresses watchers and diamonds remain coherent", () => {
  const source = ref(1);
  const parity = computed(() => source.value % 2);
  const left = computed(() => source.value * 2),
    right = computed(() => source.value * 3);
  const total = computed(() => left.value + right.value);
  const parityValues: number[] = [],
    totals: number[] = [];
  createRoot((stop) => {
    watch(parity, (value) => parityValues.push(value), {
      flush: "sync",
      immediate: true,
    });
    watch(total, (value) => totals.push(value), {
      flush: "sync",
      immediate: true,
    });
    source.value = 3;
    expect(parityValues).toEqual([1]);
    expect(totals).toEqual([5, 15]);
    batch(() => {
      source.value = 4;
      source.value = 6;
    });
    expect(parityValues).toEqual([1, 0]);
    expect(totals).toEqual([5, 15, 30]);
    stop();
    source.value = 7;
    expect(totals).toEqual([5, 15, 30]);
    expect(total.value).toBe(35);
  });
});

test("computed retains literal function results and retries errors with last successful previous value", () => {
  const source = ref(1);
  const previous: Array<number | undefined> = [];
  const value = computed<number>((old) => {
    previous.push(old);
    if (source.value === 2) throw new Error("invalid");
    return source.value;
  });
  expect(value.value).toBe(1);
  source.value = 2;
  expect(() => value.value).toThrow("invalid");
  expect(() => value.value).toThrow("invalid");
  source.value = 3;
  expect(value.value).toBe(3);
  expect(previous).toEqual([undefined, 1, 1, 1]);
  const callback = computed(() => () => source.value);
  const fn = callback.value;
  expect(callback.value).toBe(fn);
  expect(fn()).toBe(3);
});

test("watch rejects disposed owners while ownerless watches remain manually stoppable", () => {
  const value = ref(0);
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    onAfterDispose(() => {
      expect(() =>
        watch(value, (next) => seen.push(next), {
          flush: "sync",
          immediate: true,
        }),
      ).toThrow("disposed native owner");
    });
    return dispose;
  });
  stop();
  value.value = 1;
  expect(seen).toEqual([]);
  const unwatch = watch(value, (next) => seen.push(next), {
    flush: "sync",
    immediate: true,
  });
  value.value = 2;
  unwatch();
  value.value = 3;
  expect(seen).toEqual([1, 2]);
});

test("watch drains all registered cleanups in order on rerun and stop", () => {
  const value = ref(0),
    trace: string[] = [];
  const stop = watch(
    value,
    (next, _, cleanup) => {
      trace.push(`run:${next}`);
      cleanup(() => trace.push(`first:${next}`));
      cleanup(() => trace.push(`second:${next}`));
    },
    { flush: "sync", immediate: true },
  );
  value.value = 1;
  stop();
  stop();
  value.value = 2;
  expect(trace).toEqual([
    "run:0",
    "first:0",
    "second:0",
    "run:1",
    "first:1",
    "second:1",
  ]);
});

test("watch cleanup failures drain peers and preserve the first error", () => {
  const value = ref(0),
    trace: string[] = [];
  const first = new Error("first cleanup"),
    second = new Error("second cleanup");
  const stop = watch(
    value,
    (next, _, cleanup) => {
      trace.push(`run:${next}`);
      cleanup(() => {
        trace.push(`first:${next}`);
        throw first;
      });
      cleanup(() => {
        trace.push(`second:${next}`);
        throw second;
      });
      cleanup(() => trace.push(`last:${next}`));
    },
    { flush: "sync", immediate: true },
  );
  expect(() => {
    value.value = 1;
  }).toThrow(first);
  expect(trace).toEqual(["run:0", "first:0", "second:0", "last:0"]);
  value.value = 2;
  expect(() => stop()).toThrow(first);
  expect(trace.slice(-4)).toEqual(["run:2", "first:2", "second:2", "last:2"]);
  expect(stop).not.toThrow();
});

test("reentrant stop during cleanup drains peers without starting a stopped watcher", () => {
  const value = ref(0),
    trace: string[] = [];
  let stop = () => {};
  stop = watch(
    value,
    (next, _, cleanup) => {
      trace.push(`run:${next}`);
      cleanup(() => {
        trace.push("stop");
        stop();
      });
      cleanup(() => trace.push("peer"));
    },
    { flush: "sync", immediate: true },
  );
  value.value = 1;
  value.value = 2;
  stop();
  expect(trace).toEqual(["run:0", "stop", "peer"]);
});

test("cleanup writes and callback writes release each run's resources once", () => {
  const value = ref(0),
    cleaned: number[] = [],
    runs: number[] = [];
  const stop = watch(
    value,
    (next, _, cleanup) => {
      runs.push(next);
      cleanup(() => {
        cleaned.push(next);
        if (next === 0) value.value = 2;
      });
      cleanup(() => cleaned.push(next + 10));
      if (next === 2) value.value = 3;
    },
    { flush: "sync", immediate: true },
  );
  value.value = 1;
  stop();
  // Sync cleanup writes nest callbacks before the interrupted outer callback.
  expect(runs).toEqual([0, 2, 3, 1]);
  expect(cleaned).toEqual([0, 2, 12, 10, 3, 13, 1, 11]);
  expect(new Set(cleaned).size).toBe(8);
});

test("owned watch disposal drains peer cleanup failures and rejects disposed owners", () => {
  const value = ref(0),
    trace: string[] = [];
  let owner: ReturnType<typeof getOwner>;
  const stop = createRoot((dispose) => {
    owner = getOwner();
    watch(
      value,
      (_, __, cleanup) => {
        cleanup(() => {
          trace.push("first");
          throw new Error("owned cleanup");
        });
        cleanup(() => trace.push("second"));
      },
      { flush: "sync", immediate: true },
    );
    return dispose;
  });
  expect(stop).toThrow("owned cleanup");
  expect(trace).toEqual(["first", "second"]);
  expect(() =>
    runWithOwner(owner, () => watch(value, () => {}, { flush: "sync" })),
  ).toThrow("disposed native owner");
  value.value = 1;
  expect(trace).toEqual(["first", "second"]);
});

test("callback failure preserves its error while startup cleanup drains every resource", () => {
  const value = ref(0),
    trace: string[] = [];
  const failure = new Error("callback failed");
  expect(() =>
    watch(
      value,
      (_, __, cleanup) => {
        cleanup(() => {
          trace.push("first");
          throw new Error("cleanup failed");
        });
        cleanup(() => trace.push("second"));
        throw failure;
      },
      { flush: "sync", immediate: true },
    ),
  ).toThrow(failure);
  expect(trace).toEqual(["first", "second"]);
  value.value = 1;
  expect(trace).toEqual(["first", "second"]);
});

test("cleanup registered after stopping inside a callback runs immediately once", () => {
  const value = ref(0),
    trace: string[] = [];
  let stop = () => {};
  stop = watch(
    value,
    (_, __, cleanup) => {
      cleanup(() => trace.push("before"));
      stop();
      cleanup(() => trace.push("after"));
    },
    { flush: "sync" },
  );
  value.value = 1;
  stop();
  value.value = 2;
  expect(trace).toEqual(["before", "after"]);
});

test("toRef preserves native identity and getter refs stay readonly, lazy and uncached", () => {
  const source = ref(1);
  expect(toRef(source)).toBe(source);
  expect(isRef(source)).toBe(true);
  let reads = 0;
  const getter = toRef(() => {
    reads++;
    return source.value;
  });
  expect(reads).toBe(0);
  expect(isRef(getter)).toBe(true);
  expect(getter.value).toBe(1);
  expect(getter.value).toBe(1);
  expect(reads).toBe(2);
  source.value = 2;
  expect(getter.value).toBe(2);
  expect(() => {
    (getter as any).value = 3;
  }).toThrow("readonly");
  const memo = computed(() => source.value * 2);
  expect(isRef(memo)).toBe(true);
  expect(toRef(memo)).toBe(memo);
  expect(unref(memo)).toBe(4);
  expect(toRef().value).toBeUndefined();
  expect(toRef(5).value).toBe(5);
  expect(isRef({ __v_isRef: true, value: 5 })).toBe(false);
  expect(isRef(null)).toBe(false);
});

test("property toRef aliases reactive values and preserves undefined defaults and object refs", () => {
  const source = reactive<{
    count: number;
    optional?: number;
    nullable: number | null;
  }>({ count: 1, nullable: null });
  const count = toRef(source, "count"),
    optional = toRef(source, "optional", 10),
    nullable = toRef(source, "nullable", 20);
  const trace: number[] = [];
  const stop = watch(count, (value) => trace.push(value), {
    flush: "sync",
    immediate: true,
  });
  count.value = 2;
  source.count = 3;
  expect(trace).toEqual([1, 2, 3]);
  stop();
  expect(optional.value).toBe(10);
  optional.value = 7;
  expect(source.optional).toBe(7);
  source.optional = undefined;
  expect(optional.value).toBe(10);
  expect(nullable.value).toBeNull();
  nullable.value = 4;
  expect(source.nullable).toBe(4);
  const existing = ref<number | undefined>(undefined);
  expect(toRef({ existing }, "existing", ref(9))).toBe(existing);
  const wrapped = reactive({ existing });
  const alias = toRef(wrapped, "existing");
  alias.value = 8;
  expect(existing.value).toBe(8);
  const array = reactive([existing]);
  expect(toRef(array, 0)).toBe(existing);
});

test("unref keeps functions literal while toRef normalization treats functions as getters", () => {
  let calls = 0;
  const fn = () => {
    calls++;
    return 3;
  };
  expect(unref(fn)).toBe(fn);
  expect(unref(ref(fn))).toBe(fn);
  expect(calls).toBe(0);
  const getter = toRef(fn);
  expect(getter.value).toBe(3);
  expect(calls).toBe(1);
  const source = { fn, missing: undefined as typeof fn | undefined };
  expect(toRef(source, "fn").value).toBe(fn);
  expect(toRef(source, "missing", fn).value).toBe(fn);
  expect(calls).toBe(1);
  const literalGetter = toRef(() => fn);
  expect(literalGetter.value).toBe(fn);
  expect(calls).toBe(1);
  const key = Symbol("count");
  const symbols = reactive({ [key]: 1 });
  const alias = toRef(symbols, key);
  alias.value = 2;
  expect(symbols[key]).toBe(2);
});

test("shallow refs preserve external snapshot identity and track only replacement", () => {
  const raw = { nested: { count: 1 } },
    next = { nested: { count: 3 } };
  const metadata = new WeakMap([
    [raw, "raw"],
    [next, "next"],
  ]);
  const value = shallowRef(raw);
  const trace: unknown[] = [];
  let dispose!: () => void;
  createRoot((stop) => {
    dispose = stop;
    createComputed(() =>
      trace.push([value.value.nested.count, metadata.get(value.value)]),
    );
  });
  expect(value.value).toBe(raw);
  expect(value.value.nested).toBe(raw.nested);
  value.value.nested.count = 2;
  expect(trace).toEqual([[1, "raw"]]);
  value.value = raw;
  expect(trace).toEqual([[1, "raw"]]);
  value.value = next;
  expect(value.value).toBe(next);
  expect(trace).toEqual([
    [1, "raw"],
    [3, "next"],
  ]);
  dispose();
  value.value = { nested: { count: 4 } };
  expect(trace).toEqual([
    [1, "raw"],
    [3, "next"],
  ]);
});
test("shallow refs preserve existing refs, reactive proxies and literal function values", () => {
  const existing = ref(1),
    derived = computed(() => existing.value * 2);
  expect(shallowRef(existing)).toBe(existing);
  expect(shallowRef(derived)).toBe(derived);
  const value = reactive({ count: 1 }),
    shallow = shallowRef(value),
    trace: number[] = [];
  expect(shallow.value).toBe(value);
  createRoot((stop) => {
    createComputed(() => trace.push(shallow.value.count));
    value.count = 2;
    expect(trace).toEqual([1, 2]);
    stop();
  });
  let calls = 0;
  const first = () => {
      calls++;
      return 1;
    },
    second = () => calls + 2;
  const fn = shallowRef(first);
  expect(fn.value).toBe(first);
  fn.value = second;
  expect(fn.value).toBe(second);
  expect(calls).toBe(0);
  expect(shallowRef().value).toBeUndefined();
  const optional = shallowRef<number>();
  optional.value = 1;
  optional.value = undefined;
});
test("shallow ref replacement equality distinguishes signed zero and suppresses repeated NaN", () => {
  const value = shallowRef(NaN),
    trace: number[] = [];
  createRoot((stop) => {
    createComputed(() => trace.push(value.value));
    value.value = NaN;
    value.value = -0;
    value.value = 0;
    value.value = 0;
    expect(trace.length).toBe(3);
    expect(Number.isNaN(trace[0])).toBe(true);
    expect(Object.is(trace[1], -0)).toBe(true);
    expect(Object.is(trace[2], 0)).toBe(true);
    stop();
  });
});

test("reactive object and array writes preserve signed zero and suppress repeated NaN", () => {
  const value = reactive({ nested: { value: 0 }, list: [0] });
  const nested: number[] = [],
    list: number[] = [];
  createRoot((stop) => {
    createComputed(() => nested.push(value.nested.value));
    createComputed(() => list.push(value.list[0]!));
    for (const next of [-0, -0, NaN, NaN, 0]) {
      value.nested.value = next;
      value.list[0] = next;
    }
    expect(nested).toEqual([0, -0, NaN, 0]);
    expect(list).toEqual([0, -0, NaN, 0]);
    expect(Object.is(value.nested.value, 0)).toBe(true);
    stop();
  });
});

test("assigning reactive children preserves raw storage, identity and subscriptions", () => {
  const nested = { count: 1 },
    row = { count: 2 };
  const source = { nested, list: [row] };
  const value = reactive(source),
    child = value.nested,
    item = value.list[0]!;
  const other = reactive({ nested: { count: 0 } });
  const trace: unknown[] = [];
  createRoot((stop) => {
    createComputed(() =>
      trace.push([value.nested === child, value.nested.count]),
    );
    value.nested = child;
    value.list[0] = item;
    value.list.push(item);
    other.nested = child;
    expect(value.nested).toBe(child);
    expect(other.nested).toBe(child);
    expect(value.list[0]).toBe(item);
    expect(value.list[1]).toBe(item);
    expect(source.nested).toBe(nested);
    expect(source.list).toEqual([row, row]);
    expect(source.list[0]).toBe(row);
    expect(source.list[1]).toBe(row);
    child.count++;
    expect(other.nested.count).toBe(2);
    expect(trace).toEqual([
      [true, 1],
      [true, 2],
    ]);
    stop();
  });
});

test("deep ref replacement distinguishes signed zero and suppresses repeated NaN", () => {
  const value = ref(0),
    trace: number[] = [];
  createRoot((stop) => {
    createComputed(() => trace.push(value.value));
    for (const next of [-0, -0, NaN, NaN, 0]) value.value = next;
    expect(trace).toEqual([0, -0, NaN, 0]);
    expect(Object.is(trace[1], -0)).toBe(true);
    stop();
  });
});

test("Unwrap preserves DOM Node and Window types without deep ref conversion", () => {
  const nodeRef = ref<Node | null>(null);
  const windowRef = ref<Window | null>(null);
  const checkNode: Node | null = nodeRef.value;
  const checkWindow: Window | null = windowRef.value;
  expect(checkNode).toBeNull();
  expect(checkWindow).toBeNull();
});
