import { expect, test } from "bun:test";
import { withComponentErrorHandler } from "../src/errors";
import {
  customRef,
  effectScope,
  markRaw,
  onWatcherCleanup,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowRef,
  triggerRef,
  watch,
  watchSyncEffect,
} from "../src/reactive";

test("watch accepts reactive objects as direct sources with deep tracking by default", () => {
  const sym = Symbol("meta");
  const rawSkipped = markRaw({ ignored: 1 });
  const state = reactive<{
    nested: { count: number };
    items: number[];
    tags: Set<string>;
    raw: { ignored: number };
    extra?: string;
    [sym]: number;
    self?: any;
  }>({
    nested: { count: 1 },
    items: [10],
    tags: new Set(["a"]),
    raw: rawSkipped,
    [sym]: 100,
  });
  state.self = state;

  const events: Array<
    [number, number, number, number, string | undefined, boolean]
  > = [];
  const handle = watch(
    state,
    (value, oldValue) => {
      expect(value).toBe(state);
      expect(oldValue).toBe(events.length === 0 ? undefined : state);
      events.push([
        value.nested.count,
        value.items.length,
        value.tags.size,
        value[sym],
        value.extra,
        value === oldValue,
      ]);
    },
    { flush: "sync", immediate: true },
  );

  expect(events).toEqual([[1, 1, 1, 100, undefined, false]]);

  // Mutating markRaw nested object does not trigger
  rawSkipped.ignored = 2;
  expect(events).toHaveLength(1);

  // Nested object mutation triggers
  state.nested.count = 2;
  expect(events).toHaveLength(2);
  expect(events[1]).toEqual([2, 1, 1, 100, undefined, true]);

  // Array mutation triggers
  state.items.push(20);
  expect(events).toHaveLength(3);
  expect(events[2]).toEqual([2, 2, 1, 100, undefined, true]);

  // Set mutation triggers
  state.tags.add("b");
  expect(events).toHaveLength(4);
  expect(events[3]).toEqual([2, 2, 2, 100, undefined, true]);

  // Symbol property mutation triggers
  state[sym] = 200;
  expect(events).toHaveLength(5);
  expect(events[4]).toEqual([2, 2, 2, 200, undefined, true]);

  // Property addition and deletion trigger
  state.extra = "yes";
  expect(events).toHaveLength(6);
  expect(events[5]).toEqual([2, 2, 2, 200, "yes", true]);

  delete state.extra;
  expect(events).toHaveLength(7);
  expect(events[6]).toEqual([2, 2, 2, 200, undefined, true]);

  handle.stop();
  state.nested.count = 3;
  expect(events).toHaveLength(7);
});

test("watch supports readonly(reactive), shallowReactive, and numeric/boolean deep levels", () => {
  const source = reactive({
    l1: {
      l2: {
        l3: 1,
      },
    },
  });
  const ro = readonly(source);
  const roTrace: number[] = [];
  const stopRo = watch(
    ro,
    (val) => {
      roTrace.push(val.l1.l2.l3);
    },
    { flush: "sync" },
  );
  source.l1.l2.l3 = 2;
  expect(roTrace).toEqual([2]);
  stopRo();

  // deep: false on a reactive object watches only root-level (depth 1) properties
  const depth1Trace: number[] = [];
  const stopShallowOpt = watch(
    source,
    (val) => {
      depth1Trace.push(val.l1.l2.l3);
    },
    { flush: "sync", deep: false },
  );
  source.l1.l2.l3 = 3;
  expect(depth1Trace).toEqual([]);
  source.l1 = { l2: { l3: 4 } };
  expect(depth1Trace).toEqual([4]);
  stopShallowOpt();

  // Explicit numeric depth: 2 on getter returning reactive object
  const depth2Trace: number[] = [];
  const stopDepth2 = watch(
    () => source,
    (val) => {
      depth2Trace.push(val.l1.l2.l3);
    },
    { flush: "sync", deep: 2 },
  );
  // l3 is at depth 3 -> ignored
  source.l1.l2.l3 = 5;
  expect(depth2Trace).toEqual([]);
  // l2 is at depth 2 -> triggers
  source.l1.l2 = { l3: 6 };
  expect(depth2Trace).toEqual([6]);
  stopDepth2();

  // Getter without deep does not track nested reactive mutations
  const getterNoDeep: number[] = [];
  const stopGetterNoDeep = watch(
    () => source,
    (val) => getterNoDeep.push(val.l1.l2.l3),
    { flush: "sync" },
  );
  source.l1.l2.l3 = 7;
  expect(getterNoDeep).toEqual([]);
  stopGetterNoDeep();

  // Getter with deep: true tracks nested reactive mutations and nested refs
  const nestedRef = shallowRef(10);
  const holder = { nestedRef };
  const getterDeep: number[] = [];
  const stopGetterDeep = watch(
    () => holder,
    (val) => getterDeep.push(val.nestedRef.value),
    { flush: "sync", deep: true },
  );
  nestedRef.value = 20;
  expect(getterDeep).toEqual([20]);
  triggerRef(nestedRef);
  expect(getterDeep).toEqual([20, 20]);
  stopGetterDeep();

  // shallowReactive defaults to depth 1
  const shallow = shallowReactive({ top: 1, nested: { count: 1 } });
  const shallowTrace: number[] = [];
  const stopShallow = watch(
    shallow,
    (val) => shallowTrace.push(val.top + val.nested.count),
    { flush: "sync" },
  );
  shallow.nested.count = 2;
  expect(shallowTrace).toEqual([]);
  shallow.top = 10;
  expect(shallowTrace).toEqual([12]);
  stopShallow();
});

test("tuple watch with reactive object and derived getter does not falsely fire on unchanged getter", () => {
  const state = reactive({ count: 1 });
  const other = ref(1);
  const seen: Array<[number, number]> = [];

  const stop = watch(
    [state, () => other.value % 2] as const,
    ([s, parity]) => {
      seen.push([s.count, parity]);
    },
    { flush: "sync" },
  );

  // other changes 1 -> 3, parity remains 1, state did not change -> must not fire
  other.value = 3;
  expect(seen).toEqual([]);

  // state.count changes -> fires
  state.count = 2;
  expect(seen).toEqual([[2, 1]]);

  // other changes 3 -> 4, parity changes 1 -> 0 -> fires
  other.value = 4;
  expect(seen).toEqual([
    [2, 1],
    [2, 0],
  ]);

  stop();
});

test("watch once option stops after first callback in both lazy and immediate modes", () => {
  const count = ref(0);
  const trace: string[] = [];

  const stopLazy = watch(
    count,
    (next, prev, onCleanup) => {
      trace.push(`lazy:${prev}->${next}`);
      onCleanup(() => trace.push(`lazy-param-clean:${next}`));
      onWatcherCleanup(() => trace.push(`lazy-hook-clean:${next}`));
    },
    { flush: "sync", once: true },
  );

  expect(trace).toEqual([]);
  count.value = 1;
  expect(trace).toEqual([
    "lazy:0->1",
    "lazy-param-clean:1",
    "lazy-hook-clean:1",
  ]);
  count.value = 2;
  expect(trace).toHaveLength(3);
  stopLazy();

  // Immediate + once runs during setup and immediately disposes
  const immTrace: string[] = [];
  watch(
    count,
    (next, prev) => {
      immTrace.push(`imm:${String(prev)}->${next}`);
      onWatcherCleanup(() => immTrace.push(`imm-clean:${next}`));
    },
    { flush: "sync", immediate: true, once: true },
  );
  expect(immTrace).toEqual(["imm:undefined->2", "imm-clean:2"]);
  count.value = 3;
  expect(immTrace).toEqual(["imm:undefined->2", "imm-clean:2"]);

  // Throwing inside a once callback still stops the watcher
  const throwingCount = ref(0);
  let attempts = 0;
  watch(
    throwingCount,
    () => {
      attempts++;
      throw new Error("once failure");
    },
    { flush: "sync", once: true },
  );
  expect(() => {
    throwingCount.value = 1;
  }).toThrow("once failure");
  throwingCount.value = 2;
  expect(attempts).toBe(1);
});

test("onWatcherCleanup registers cleanups on active watch and watchSyncEffect with nesting and error routing", () => {
  expect(() => onWatcherCleanup(() => {})).toThrow(
    "onWatcherCleanup requires an active watcher",
  );
  expect(() => onWatcherCleanup(() => {}, true)).not.toThrow();
  expect(() => onWatcherCleanup("invalid" as any, true)).toThrow(
    "Watcher cleanup must be a function",
  );

  const outerRef = ref(0);
  const innerRef = ref(10);
  const log: string[] = [];
  let stopInner: (() => void) | undefined;

  const stopOuter = watchSyncEffect((onCleanup) => {
    const outerVal = outerRef.value;
    log.push(`outer:${outerVal}`);
    onCleanup(() => log.push(`outer-param-clean:${outerVal}`));
    onWatcherCleanup(() => log.push(`outer-hook-clean-before:${outerVal}`));

    stopInner?.();
    stopInner = watch(
      innerRef,
      (innerVal) => {
        log.push(`inner:${innerVal}`);
        onWatcherCleanup(() => {
          log.push(`inner-hook-clean:${innerVal}`);
          // Calling onWatcherCleanup inside a cleanup function is outside active watcher execution
          expect(() => onWatcherCleanup(() => {})).toThrow(
            "onWatcherCleanup requires an active watcher",
          );
          onWatcherCleanup(() => log.push("ignored"), true);
        });
      },
      { flush: "sync", immediate: true },
    );

    onWatcherCleanup(() => log.push(`outer-hook-clean-after:${outerVal}`));
  });

  expect(log).toEqual(["outer:0", "inner:10"]);

  innerRef.value = 20;
  expect(log).toEqual([
    "outer:0",
    "inner:10",
    "inner-hook-clean:10",
    "inner:20",
  ]);

  outerRef.value = 1;
  expect(log).toEqual([
    "outer:0",
    "inner:10",
    "inner-hook-clean:10",
    "inner:20",
    "inner-hook-clean:20",
    "outer-param-clean:0",
    "outer-hook-clean-before:0",
    "outer-hook-clean-after:0",
    "outer:1",
    "inner:20",
  ]);

  stopInner?.();
  stopOuter();

  // Calling onWatcherCleanup inside a watch getter is rejected
  const getterCheck = ref(0);
  expect(() =>
    watch(
      () => {
        onWatcherCleanup(() => {});
        return getterCheck.value;
      },
      () => {},
      { flush: "sync" },
    ),
  ).toThrow("onWatcherCleanup requires an active watcher");

  // Error routing through withComponentErrorHandler for onWatcherCleanup
  const routed: Array<[unknown, string]> = [];
  const errRef = ref(0);
  const errScope = effectScope();
  errScope.run(() => {
    withComponentErrorHandler(
      (err, info) => routed.push([err, info.phase]),
      () => {
        const stop = watch(
          errRef,
          (v) => {
            onWatcherCleanup(() => {
              throw `clean-err:${v}`;
            });
          },
          { flush: "sync", immediate: true },
        );
        errRef.value = 1;
        stop();
      },
    );
  });
  errScope.stop();
  expect(routed).toEqual([
    ["clean-err:0", "watch cleanup"],
    ["clean-err:1", "watch cleanup"],
  ]);
});

test("WatchHandle pause, resume, and stop control watch and watchSyncEffect", () => {
  const count = ref(1);
  const watchLog: Array<[number, number | undefined]> = [];
  const cleanLog: number[] = [];

  const handle = watch(
    count,
    (next, prev) => {
      watchLog.push([next, prev]);
      onWatcherCleanup(() => cleanLog.push(next));
    },
    { flush: "sync" },
  );

  expect(typeof handle).toBe("function");
  expect(typeof handle.stop).toBe("function");
  expect(typeof handle.pause).toBe("function");
  expect(typeof handle.resume).toBe("function");

  count.value = 2;
  expect(watchLog).toEqual([[2, 1]]);
  expect(cleanLog).toEqual([]);

  // Pause and mutate multiple times
  handle.pause();
  count.value = 3;
  count.value = 4;
  expect(watchLog).toEqual([[2, 1]]);
  expect(cleanLog).toEqual([]);

  // Resume flushes with latest value (4) and last unpaused previous value (2)
  handle.resume();
  expect(cleanLog).toEqual([2]);
  expect(watchLog).toEqual([
    [2, 1],
    [4, 2],
  ]);

  // Pause and bounce value 4 -> 5 -> 4: resume sees no net change from 4
  handle.pause();
  count.value = 5;
  count.value = 4;
  handle.resume();
  expect(watchLog).toHaveLength(2);
  expect(cleanLog).toEqual([2]);

  // Pause with no changes: resume is a no-op
  handle.pause();
  handle.resume();
  expect(watchLog).toHaveLength(2);

  // Stop while paused runs cleanup and makes future resume a no-op
  handle.pause();
  count.value = 6;
  handle.stop();
  expect(cleanLog).toEqual([2, 4]);
  handle.resume();
  count.value = 7;
  expect(watchLog).toHaveLength(2);

  // watchSyncEffect pause/resume/stop
  const effectSource = customRef<number>((track, trigger) => {
    let current = 10;
    return {
      get() {
        track();
        return current;
      },
      set(next) {
        current = next;
        trigger();
      },
    };
  });
  const effectLog: string[] = [];
  const scope = effectScope();
  const effectHandle = scope.run(() =>
    watchSyncEffect(() => {
      const v = effectSource.value;
      effectLog.push(`run:${v}`);
      onWatcherCleanup(() => effectLog.push(`clean:${v}`));
    }),
  )!;

  expect(effectLog).toEqual(["run:10"]);
  effectHandle.pause();
  effectSource.value = 20;
  effectSource.value = 30;
  expect(effectLog).toEqual(["run:10"]);

  effectHandle.resume();
  expect(effectLog).toEqual(["run:10", "clean:10", "run:30"]);

  scope.stop();
  expect(effectLog).toEqual(["run:10", "clean:10", "run:30", "clean:30"]);
  effectSource.value = 40;
  expect(effectLog).toHaveLength(4);
});
