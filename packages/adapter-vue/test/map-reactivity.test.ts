import { expect, test } from "bun:test";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import {
  computed,
  isProxy,
  isReactive,
  isReadonly,
  isShallow,
  markRaw,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowReadonly,
  toRaw,
  watch,
  watchSyncEffect,
} from "../src/reactive";

test("reactive Map tracks per-key get/has/set/delete and collection size/iteration", () => {
  createRoot((stop) => {
    const map = reactive(
      new Map<string, { count: number }>([["a", { count: 1 }]]),
    );
    expect(isReactive(map)).toBe(true);
    expect(isProxy(map)).toBe(true);
    expect(isReadonly(map)).toBe(false);
    expect(isShallow(map)).toBe(false);

    let aReads = 0;
    const aValue = computed(() => {
      aReads++;
      return map.get("a")?.count ?? 0;
    });
    let bHasReads = 0;
    const hasB = computed(() => {
      bHasReads++;
      return map.has("b");
    });
    let sizeReads = 0;
    const totalSize = computed(() => {
      sizeReads++;
      return map.size;
    });

    expect(aValue.value).toBe(1);
    expect(hasB.value).toBe(false);
    expect(totalSize.value).toBe(1);
    expect([aReads, bHasReads, sizeReads]).toEqual([1, 1, 1]);

    // Updating an existing key's nested reactive property triggers only its reader.
    map.get("a")!.count = 2;
    expect(aValue.value).toBe(2);
    expect([aReads, bHasReads, sizeReads]).toEqual([2, 1, 1]);

    // Adding a new key notifies `has("b")` and `size`, not `get("a")`.
    map.set("b", { count: 10 });
    expect(hasB.value).toBe(true);
    expect(totalSize.value).toBe(2);
    expect(aValue.value).toBe(2);
    expect([aReads, bHasReads, sizeReads]).toEqual([2, 2, 2]);

    // Setting the same reference on an existing key is a no-op.
    const existingB = toRaw(map.get("b")!);
    map.set("b", existingB);
    expect(hasB.value).toBe(true);
    expect(totalSize.value).toBe(2);
    expect([aReads, bHasReads, sizeReads]).toEqual([2, 2, 2]);

    // Replacing key "a" notifies `get("a")`, not `size` or `has("b")`.
    map.set("a", { count: 5 });
    expect(aValue.value).toBe(5);
    expect([aReads, bHasReads, sizeReads]).toEqual([3, 2, 2]);

    // Deleting key "b" notifies `has("b")` and `size`.
    expect(map.delete("b")).toBe(true);
    expect(map.delete("b")).toBe(false);
    expect(hasB.value).toBe(false);
    expect(totalSize.value).toBe(1);
    expect([aReads, bHasReads, sizeReads]).toEqual([3, 3, 3]);

    // Clearing the map notifies `get("a")` and `size`, not already-absent `has("b")`.
    map.clear();
    expect(aValue.value).toBe(0);
    expect(totalSize.value).toBe(0);
    expect([aReads, bHasReads, sizeReads]).toEqual([4, 3, 4]);

    stop();
  });
});

test("reactive Map normalizes raw/proxy keys and wraps iterated keys and values", () => {
  const rawKey = { id: 1 };
  const proxyKey = reactive(rawKey);
  const rawVal = { label: "initial" };
  const map = reactive(new Map<typeof rawKey, typeof rawVal>());

  map.set(proxyKey, reactive(rawVal));
  // Underlying target stores raw key and raw value to prevent duplicate entries.
  expect(toRaw(map).has(rawKey)).toBe(true);
  expect(toRaw(map).has(proxyKey)).toBe(false);
  expect(toRaw(map).get(rawKey)).toBe(rawVal);

  expect(map.has(rawKey)).toBe(true);
  expect(map.has(proxyKey)).toBe(true);
  expect(map.get(rawKey)).toBe(reactive(rawVal));
  expect(map.get(proxyKey)).toBe(reactive(rawVal));

  const keys = [...map.keys()];
  const values = [...map.values()];
  const entries = [...map.entries()];
  expect(keys).toEqual([proxyKey]);
  expect(isReactive(keys[0])).toBe(true);
  expect(values).toEqual([reactive(rawVal)]);
  expect(isReactive(values[0])).toBe(true);
  expect(entries).toEqual([[proxyKey, reactive(rawVal)]]);

  const seen: Array<[unknown, unknown, unknown]> = [];
  map.forEach((value, key, receiver) => {
    seen.push([key, value, receiver]);
  });
  expect(seen).toEqual([[proxyKey, reactive(rawVal), map]]);
  expect(map.delete(rawKey)).toBe(true);
  expect(map.size).toBe(0);
});

test("shallowReactive, readonly, shallowReadonly, ref, and watch work with Map", () => {
  createRoot((stop) => {
    const nested = { count: 1 };
    const shallow = shallowReactive(new Map([["a", nested]]));
    expect(isReactive(shallow)).toBe(true);
    expect(isShallow(shallow)).toBe(true);
    expect(shallow.get("a")).toBe(nested);
    expect(isReactive(shallow.get("a"))).toBe(false);

    const deepRo = readonly(new Map([["a", { count: 2 }]]));
    expect(isReadonly(deepRo)).toBe(true);
    expect(isShallow(deepRo)).toBe(false);
    expect(isReadonly(deepRo.get("a"))).toBe(true);
    expect(() =>
      (deepRo as Map<string, { count: number }>).set("b", { count: 3 }),
    ).toThrow("Cannot mutate a readonly Map");
    expect(() =>
      (deepRo as Map<string, { count: number }>).delete("a"),
    ).toThrow("Cannot mutate a readonly Map");
    expect(() => (deepRo as Map<string, { count: number }>).clear()).toThrow(
      "Cannot mutate a readonly Map",
    );

    const shallowRo = shallowReadonly(new Map([["a", nested]]));
    expect(isReadonly(shallowRo)).toBe(true);
    expect(isShallow(shallowRo)).toBe(true);
    expect(isReadonly(shallowRo.get("a"))).toBe(false);

    // ref(new Map()) wraps deeply and tracks nested mutations in watch() with deep: true,
    // while reactive(new Map()) defaults to deep: true in watch().
    const state = ref(
      new Map<string, { count: number }>([["a", { count: 10 }]]),
    );
    const trace: number[] = [];
    watch(
      state,
      (current) => {
        trace.push(current.get("a")?.count ?? -1);
      },
      { flush: "sync", immediate: true, deep: true },
    );
    expect(trace).toEqual([10]);
    state.value.get("a")!.count = 20;
    expect(trace).toEqual([10, 20]);
    state.value.set("a", { count: 30 });
    expect(trace).toEqual([10, 20, 30]);

    const reactiveMap = reactive(
      new Map<string, { count: number }>([["a", { count: 1 }]]),
    );
    const reactiveTrace: number[] = [];
    watch(
      reactiveMap,
      (current) => {
        reactiveTrace.push(current.get("a")?.count ?? -1);
      },
      { flush: "sync", immediate: true },
    );
    reactiveMap.get("a")!.count = 2;
    reactiveMap.set("a", { count: 3 });
    expect(reactiveTrace).toEqual([1, 2, 3]);

    // Readonly wrapper over a reactive Map forwards reactive tracking.
    const live = reactive(new Map<string, number>([["x", 1]]));
    const roLive = readonly(live);
    const observed: Array<number | undefined> = [];
    const stopEffect = watchSyncEffect(() => {
      observed.push(roLive.get("x"));
    });
    live.set("x", 2);
    stopEffect();
    expect(observed).toEqual([1, 2]);

    // markRaw(new Map()) remains unproxied.
    const rawMap = markRaw(new Map([["k", 1]]));
    expect(reactive(rawMap)).toBe(rawMap);
    expect(readonly(rawMap)).toBe(rawMap);

    stop();
  });
});
