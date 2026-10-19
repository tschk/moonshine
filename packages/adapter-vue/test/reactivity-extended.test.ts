import { expect, test } from "bun:test";
import { createComponent } from "@tschk/moonshine-dom/component";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import {
  computed,
  customRef,
  effectScope,
  getCurrentScope,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  isShallow,
  markRaw,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  toRaw,
  toRef,
  toValue,
  triggerRef,
  watch,
  watchSyncEffect,
} from "../src/reactive";

test("toValue normalizes primitives, refs, readonly refs and getters while keeping ref(fn) literal", () => {
  expect(toValue(42)).toBe(42);
  expect(toValue("hello")).toBe("hello");
  const r = ref(10);
  expect(toValue(r)).toBe(10);
  const c = computed(() => r.value * 2);
  expect(toValue(c)).toBe(20);
  expect(toValue(() => r.value + 5)).toBe(15);
  let called = 0;
  const fn = () => {
    called++;
    return 99;
  };
  const fnRef = ref(fn);
  expect(toValue(fnRef)).toBe(fn);
  expect(called).toBe(0);
  expect(toValue(fn)).toBe(99);
  expect(called).toBe(1);
});

test("triggerRef forces subscribers of shallowRef, ref and customRef to re-evaluate including watch", () => {
  const state = shallowRef({ count: 1 });
  const effectSeen: number[] = [];
  const watchSeen: number[] = [];
  const doubled = computed(() => state.value.count * 2);

  const stopEffect = watchSyncEffect(() => {
    effectSeen.push(state.value.count);
  });
  const stopWatch = watch(
    state,
    (val) => {
      watchSeen.push(val.count);
    },
    { flush: "sync" },
  );

  expect(effectSeen).toEqual([1]);
  expect(watchSeen).toEqual([]);
  expect(doubled.value).toBe(2);

  state.value.count = 5;
  expect(effectSeen).toEqual([1]);
  expect(watchSeen).toEqual([]);
  expect(doubled.value).toBe(2);

  triggerRef(state);
  expect(effectSeen).toEqual([1, 5]);
  expect(watchSeen).toEqual([5]);
  expect(doubled.value).toBe(10);

  stopEffect();
  stopWatch();
  expect(() => triggerRef({} as any)).toThrow("native ref");
});

test("customRef tracks and triggers explicitly across effects, computed and watch", () => {
  let raw = 1;
  let allowWrite = true;
  const custom = customRef<number>((track, trigger) => ({
    get() {
      track();
      return raw;
    },
    set(next) {
      if (!allowWrite) return;
      raw = next;
      trigger();
    },
  }));

  expect(isRef(custom)).toBe(true);
  expect(isReadonly(custom)).toBe(false);
  expect(isProxy(custom)).toBe(false);

  const seen: number[] = [];
  const watched: Array<[number, number | undefined]> = [];
  const stopEffect = watchSyncEffect(() => {
    seen.push(custom.value);
  });
  const stopWatch = watch(
    custom,
    (next, prev) => {
      watched.push([next, prev]);
    },
    { flush: "sync" },
  );

  expect(seen).toEqual([1]);
  custom.value = 2;
  expect(seen).toEqual([1, 2]);
  expect(watched).toEqual([[2, 1]]);

  allowWrite = false;
  custom.value = 3;
  expect(custom.value).toBe(2);
  expect(seen).toEqual([1, 2]);
  expect(watched).toEqual([[2, 1]]);

  triggerRef(custom);
  expect(seen).toEqual([1, 2, 2]);
  expect(watched).toEqual([
    [2, 1],
    [2, 2],
  ]);

  stopEffect();
  stopWatch();

  expect(() => customRef(null as any)).toThrow("factory function");
  expect(() => customRef((() => ({})) as any)).toThrow("get and set functions");
});

test("markRaw prevents wrapping at root and nested object/array/Set positions while preserving parent tracking", () => {
  const marked = markRaw({ nested: { count: 1 } });
  const markedSet = markRaw(new Set([1]));
  expect(reactive(marked)).toBe(marked);
  expect(shallowReactive(marked)).toBe(marked);
  expect(readonly(marked)).toBe(marked);
  expect(shallowReadonly(marked)).toBe(marked);
  expect(ref(marked).value).toBe(marked);
  expect(reactive(markedSet)).toBe(markedSet);
  expect(isProxy(reactive(marked))).toBe(false);

  const parent = reactive({
    raw: marked,
    list: [marked],
    set: new Set([marked]),
    normal: { count: 1 },
  });
  expect(parent.raw).toBe(marked);
  expect(isProxy(parent.raw)).toBe(false);
  expect(parent.list[0]).toBe(marked);
  expect(isProxy(parent.list[0])).toBe(false);
  expect([...parent.set][0]).toBe(marked);
  expect(isProxy([...parent.set][0])).toBe(false);
  expect(isReactive(parent.normal)).toBe(true);

  const seen: number[] = [];
  const stop = watchSyncEffect(() => {
    seen.push(parent.raw.nested.count);
  });
  expect(seen).toEqual([1]);
  parent.raw.nested.count = 2;
  expect(seen).toEqual([1]);
  parent.raw = markRaw({ nested: { count: 9 } });
  expect(seen).toEqual([1, 9]);
  stop();
});

test("toRaw unwraps reactive, shallowReactive, readonly, shallowReadonly and nested proxies", () => {
  const rawObj = { nested: { a: 1 }, list: [{ b: 2 }] };
  const rawSet = new Set([{ c: 3 }]);

  const r = reactive(rawObj);
  const sr = shallowReactive(rawObj);
  const ro = readonly(rawObj);
  const sro = shallowReadonly(rawObj);
  const roOfR = readonly(r);
  const sroOfSr = shallowReadonly(sr);
  const rSet = reactive(rawSet);
  const roSet = readonly(rSet);

  expect(toRaw(r)).toBe(rawObj);
  expect(toRaw(r.nested)).toBe(rawObj.nested);
  expect(toRaw(r.list[0])).toBe(rawObj.list[0]);
  expect(toRaw(sr)).toBe(rawObj);
  expect(toRaw(ro)).toBe(rawObj);
  expect(toRaw(ro.nested)).toBe(rawObj.nested);
  expect(toRaw(sro)).toBe(rawObj);
  expect(toRaw(roOfR)).toBe(rawObj);
  expect(toRaw(roOfR.nested)).toBe(rawObj.nested);
  expect(toRaw(sroOfSr)).toBe(rawObj);
  expect(toRaw(rSet)).toBe(rawSet);
  expect(toRaw(roSet)).toBe(rawSet);
  expect(toRaw(42)).toBe(42);
  expect(toRaw(null)).toBeNull();
});

test("shallowReactive tracks root properties, arrays and Sets without deep wrapping or ref unwrapping", () => {
  const inner = { deep: 1 };
  const innerRef = ref(10);
  const state = shallowReactive<{
    count: number;
    inner: { deep: number };
    innerRef: typeof innerRef;
    extra?: string;
  }>({
    count: 1,
    inner,
    innerRef,
  });

  expect(shallowReactive(state)).toBe(state);
  expect(isReactive(state)).toBe(true);
  expect(isShallow(state)).toBe(true);
  expect(isReadonly(state)).toBe(false);
  expect(isProxy(state)).toBe(true);
  expect(state.inner).toBe(inner);
  expect(isProxy(state.inner)).toBe(false);
  expect(state.innerRef).toBe(innerRef);

  const counts: number[] = [];
  const keys: string[][] = [];
  const hasExtra: boolean[] = [];
  const stopCount = watchSyncEffect(() =>
    counts.push(state.count + state.inner.deep),
  );
  const stopKeys = watchSyncEffect(() => keys.push(Object.keys(state)));
  const stopHas = watchSyncEffect(() => hasExtra.push("extra" in state));

  state.inner.deep = 5;
  expect(counts).toEqual([2]);
  state.count = 2;
  expect(counts).toEqual([2, 7]);

  state.extra = "yes";
  expect(hasExtra).toEqual([false, true]);
  expect(keys.at(-1)).toEqual(["count", "inner", "innerRef", "extra"]);
  delete state.extra;
  expect(hasExtra).toEqual([false, true, false]);

  stopCount();
  stopKeys();
  stopHas();

  const arr = shallowReactive([{ v: 1 }]);
  expect(isProxy(arr[0])).toBe(false);
  const lengths: number[] = [];
  const stopArr = watchSyncEffect(() => lengths.push(arr.length));
  arr.push({ v: 2 });
  expect(lengths).toEqual([1, 2]);
  expect(isProxy(arr[1])).toBe(false);
  arr.pop();
  expect(lengths).toEqual([1, 2, 1]);
  stopArr();

  const rawItem = { id: 1 };
  const set = shallowReactive(new Set([rawItem]));
  expect(isReactive(set)).toBe(true);
  expect(isShallow(set)).toBe(true);
  expect([...set][0]).toBe(rawItem);
  expect(isProxy([...set][0])).toBe(false);
});

test("readonly and shallowReadonly enforce immutability while forwarding reactive tracking", () => {
  const countRef = ref(5);
  const live = reactive({
    count: 1,
    nested: { label: "a", refVal: countRef },
    list: [countRef],
    set: new Set([{ item: 1 }]),
  });
  const ro = readonly(live);

  expect(readonly(ro)).toBe(ro);
  expect(isReadonly(ro)).toBe(true);
  expect(isReactive(ro)).toBe(true);
  expect(isShallow(ro)).toBe(false);
  expect(isProxy(ro)).toBe(true);
  expect(isReadonly(ro.nested)).toBe(true);
  expect(isReactive(ro.nested)).toBe(true);
  expect(ro.nested.refVal).toBe(5);
  expect(isRef(ro.list[0])).toBe(true);
  expect(isReadonly(ro.list[0])).toBe(true);

  const seen: string[] = [];
  const stop = watchSyncEffect(() => {
    seen.push(
      `${ro.count}:${ro.nested.label}:${ro.nested.refVal}:${ro.set.size}`,
    );
  });
  expect(seen).toEqual(["1:a:5:1"]);

  live.count = 2;
  live.nested.label = "b";
  countRef.value = 6;
  live.set.add({ item: 2 });
  expect(seen).toEqual(["1:a:5:1", "2:a:5:1", "2:b:5:1", "2:b:6:1", "2:b:6:2"]);
  stop();

  const [firstSetItem] = [...ro.set];
  expect(isReadonly(firstSetItem)).toBe(true);
  expect(() => {
    (ro as any).count = 99;
  }).toThrow("read only");
  expect(() => {
    delete (ro as any).count;
  }).toThrow("readonly");
  expect(() => {
    Object.defineProperty(ro, "count", { value: 10 });
  }).toThrow("readonly");
  expect(() => {
    (ro.set as any).add({ item: 3 });
  }).toThrow("readonly Set");
  expect(() => {
    (ro.list[0] as any).value = 10;
  }).toThrow("readonly");

  const roRef = readonly(countRef);
  expect(isRef(roRef)).toBe(true);
  expect(isReadonly(roRef)).toBe(true);
  expect(isProxy(roRef)).toBe(false);
  expect(roRef.value).toBe(6);
  expect(() => {
    (roRef as any).value = 7;
  }).toThrow("readonly");

  const sro = shallowReadonly({
    top: 1,
    nested: { mutable: 2 },
    refProp: countRef,
  });
  expect(isReadonly(sro)).toBe(true);
  expect(isShallow(sro)).toBe(true);
  expect(isReactive(sro)).toBe(false);
  expect(isProxy(sro)).toBe(true);
  expect(isReadonly(sro.nested)).toBe(false);
  expect(sro.refProp).toBe(countRef);
  expect(() => {
    (sro as any).top = 2;
  }).toThrow("read only");
  sro.nested.mutable = 3;
  expect(sro.nested.mutable).toBe(3);
});

test("inspection helpers distinguish refs, computed, reactive, shallow and readonly variants", () => {
  const plainObj = { a: 1 };
  const r = ref(1);
  const sr = shallowRef({ a: 1 });
  const cRead = computed(() => r.value);
  const cWrite = computed({ get: () => r.value, set: (v) => (r.value = v) });
  const getterRef = toRef(() => r.value);
  const propRef = toRef(plainObj, "a");

  expect(isRef(r)).toBe(true);
  expect(isShallow(r)).toBe(false);
  expect(isReadonly(r)).toBe(false);
  expect(isProxy(r)).toBe(false);

  expect(isRef(sr)).toBe(true);
  expect(isShallow(sr)).toBe(true);
  expect(isReadonly(sr)).toBe(false);
  expect(isProxy(sr)).toBe(false);

  expect(isReadonly(cRead)).toBe(true);
  expect(isReadonly(cWrite)).toBe(false);
  expect(isReadonly(getterRef)).toBe(true);
  expect(isReadonly(propRef)).toBe(false);
  expect(isProxy(cRead)).toBe(false);
});

test("effectScope manages watchers, computed, nested scopes, detached scopes and onScopeDispose", () => {
  expect(getCurrentScope()).toBeUndefined();
  expect(() => onScopeDispose(() => {})).toThrow("active effectScope");
  expect(() => onScopeDispose(() => {}, true)).not.toThrow();

  const source = ref(1);
  const parentSeen: number[] = [];
  const childSeen: number[] = [];
  const detachedSeen: number[] = [];
  const disposed: string[] = [];

  const parent = effectScope();
  let childScope!: ReturnType<typeof effectScope>;
  let detachedScope!: ReturnType<typeof effectScope>;

  const result = parent.run(() => {
    expect(getCurrentScope()).toBe(parent);
    onScopeDispose(() => disposed.push("parent-1"));
    watchSyncEffect(() => {
      parentSeen.push(source.value);
    });

    childScope = effectScope();
    childScope.run(() => {
      expect(getCurrentScope()).toBe(childScope);
      onScopeDispose(() => disposed.push("child"));
      watch(
        source,
        (v) => {
          childSeen.push(v);
        },
        { flush: "sync" },
      );
    });
    expect(getCurrentScope()).toBe(parent);

    detachedScope = effectScope(true);
    detachedScope.run(() => {
      expect(getCurrentScope()).toBe(detachedScope);
      onScopeDispose(() => disposed.push("detached"));
      watchSyncEffect(() => {
        detachedSeen.push(source.value);
      });
    });
    return "ok";
  });

  expect(result).toBe("ok");
  expect(getCurrentScope()).toBeUndefined();

  parent.run(() => {
    onScopeDispose(() => disposed.push("parent-2"));
  });

  source.value = 2;
  expect(parentSeen).toEqual([1, 2]);
  expect(childSeen).toEqual([2]);
  expect(detachedSeen).toEqual([1, 2]);

  parent.stop();
  expect(parent.active).toBe(false);
  expect(childScope.active).toBe(false);
  expect(detachedScope.active).toBe(true);
  expect(disposed).toEqual(["child", "parent-1", "parent-2"]);

  let ranAfterStop = false;
  expect(
    parent.run(() => {
      ranAfterStop = true;
      return 1;
    }),
  ).toBeUndefined();
  expect(ranAfterStop).toBe(false);

  source.value = 3;
  expect(parentSeen).toEqual([1, 2]);
  expect(childSeen).toEqual([2]);
  expect(detachedSeen).toEqual([1, 2, 3]);

  detachedScope.stop();
  expect(detachedScope.active).toBe(false);
  expect(disposed).toEqual(["child", "parent-1", "parent-2", "detached"]);
  source.value = 4;
  expect(detachedSeen).toEqual([1, 2, 3]);
});

test("getCurrentScope and onScopeDispose integrate with native component setup and unmount", () => {
  const source = ref(10);
  const seen: number[] = [];
  const events: string[] = [];

  const stopRoot = createRoot((dispose) => {
    createComponent(
      () => {
        const scope = getCurrentScope();
        expect(scope).toBeDefined();
        expect(scope?.active).toBe(true);
        onScopeDispose(() => {
          events.push("component-scope-disposed");
        });
        const child = effectScope();
        child.run(() => {
          watchSyncEffect(() => {
            seen.push(source.value);
          });
          onScopeDispose(() => {
            events.push("child-scope-disposed");
          });
        });
      },
      {},
      "dom",
    );
    return dispose;
  });

  expect(seen).toEqual([10]);
  source.value = 20;
  expect(seen).toEqual([10, 20]);
  expect(events).toEqual([]);

  stopRoot();
  expect(events).toEqual(["child-scope-disposed", "component-scope-disposed"]);
  source.value = 30;
  expect(seen).toEqual([10, 20]);
});
