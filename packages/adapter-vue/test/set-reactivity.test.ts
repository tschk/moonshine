import { expect, test } from "bun:test";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import {
  isReactive,
  isRef,
  reactive,
  ref,
  shallowRef,
  watchSyncEffect,
} from "../src/reactive";

function track<T>(read: () => T) {
  const seen: T[] = [];
  const stop = watchSyncEffect(() => {
    seen.push(read());
  });
  return { seen, stop };
}

test("reactive(new Set) returns a stable reactive proxy", () => {
  const raw = new Set([1, 2]);
  const set = reactive(raw);
  expect(isReactive(set)).toBe(true);
  expect(isReactive(raw)).toBe(false);
  expect(reactive(raw)).toBe(set);
  expect(reactive(set)).toBe(set);
  expect(set instanceof Set).toBe(true);
  expect(set.size).toBe(2);
  expect(set.has(1)).toBe(true);
  expect([...set]).toEqual([1, 2]);
});

test("ref(new Set) exposes a stable reactive Set that tracks mutations", () => {
  const state = ref(new Set<number>());
  const first = state.value;
  expect(isReactive(first)).toBe(true);
  expect(state.value).toBe(first);
  expect(ref(state)).toBe(state);
  const { seen, stop } = track(() => state.value.size);
  state.value.add(1);
  state.value.add(2);
  expect(seen).toEqual([0, 1, 2]);
  stop();
});

test("Set nested in a plain reactive object is reactive with stable identity", () => {
  const state = reactive({ tags: new Set<string>(["a"]) });
  const tags = state.tags;
  expect(isReactive(tags)).toBe(true);
  expect(state.tags).toBe(tags);
  const { seen, stop } = track(() => tags.has("b"));
  tags.add("b");
  state.tags.delete("b");
  expect(seen).toEqual([false, true, false]);
  stop();
});

test("has tracks per key and ignores unrelated mutations", () => {
  const set = reactive(new Set<number>());
  const { seen, stop } = track(() => set.has(1));
  set.add(2);
  set.add(3);
  set.delete(2);
  expect(seen).toEqual([false]);
  set.add(1);
  expect(seen).toEqual([false, true]);
  set.delete(1);
  expect(seen).toEqual([false, true, false]);
  stop();
});

test("size tracks additions, deletions and clear", () => {
  const set = reactive(new Set<number>());
  const { seen, stop } = track(() => set.size);
  set.add(1);
  set.add(2);
  set.delete(1);
  set.clear();
  expect(seen).toEqual([0, 1, 2, 1, 0]);
  stop();
});

test("iteration, keys, values, entries and forEach track membership changes", () => {
  const set = reactive(new Set<number>([1]));
  const spread = track(() => [...set]);
  const keys = track(() => [...set.keys()]);
  const values = track(() => [...set.values()]);
  const entries = track(() => [...set.entries()]);
  const each = track(() => {
    const out: number[] = [];
    set.forEach((value) => out.push(value));
    return out;
  });
  set.add(2);
  expect(spread.seen).toEqual([[1], [1, 2]]);
  expect(keys.seen).toEqual([[1], [1, 2]]);
  expect(values.seen).toEqual([[1], [1, 2]]);
  expect(entries.seen).toEqual([
    [[1, 1]],
    [
      [1, 1],
      [2, 2],
    ],
  ]);
  expect(each.seen).toEqual([[1], [1, 2]]);
  set.delete(1);
  expect(spread.seen.at(-1)).toEqual([2]);
  expect(each.seen.at(-1)).toEqual([2]);
  for (const t of [spread, keys, values, entries, each]) t.stop();
});

test("duplicate add, missing delete and empty clear do not notify", () => {
  const set = reactive(new Set<number>());
  const size = track(() => set.size);
  const has = track(() => set.has(1));
  const items = track(() => [...set]);
  const each = track(() => {
    let count = 0;
    set.forEach(() => count++);
    return count;
  });
  set.clear();
  set.delete(1);
  expect(size.seen).toEqual([0]);
  expect(has.seen).toEqual([false]);
  expect(items.seen.length).toBe(1);
  expect(each.seen).toEqual([0]);
  set.add(1);
  expect(size.seen).toEqual([0, 1]);
  expect(has.seen).toEqual([false, true]);
  expect(items.seen.length).toBe(2);
  expect(each.seen).toEqual([0, 1]);
  set.add(1);
  set.delete(2);
  expect(size.seen).toEqual([0, 1]);
  expect(has.seen).toEqual([false, true]);
  expect(items.seen.length).toBe(2);
  expect(each.seen).toEqual([0, 1]);
  for (const t of [size, has, items, each]) t.stop();
});

test("add returns the proxy for chaining and delete returns a boolean", () => {
  const set = reactive(new Set<number>());
  expect(set.add(1)).toBe(set);
  expect(set.add(2).add(3)).toBe(set);
  expect([...set]).toEqual([1, 2, 3]);
  expect(set.delete(2)).toBe(true);
  expect(set.delete(2)).toBe(false);
  expect(set.delete(99)).toBe(false);
  expect([...set]).toEqual([1, 3]);
});

test("plain-object values wrap to native reactive with raw and proxy membership", () => {
  const raw = { count: 1 };
  const set = reactive(new Set<{ count: number }>());
  set.add(raw);
  const proxy = reactive(raw);
  expect(set.size).toBe(1);
  expect(set.has(raw)).toBe(true);
  expect(set.has(proxy)).toBe(true);
  set.add(proxy);
  set.add(raw);
  expect(set.size).toBe(1);
  const [stored] = [...set];
  expect(isReactive(stored)).toBe(true);
  expect(stored).toBe(proxy);
  const { seen, stop } = track(() => stored.count);
  proxy.count = 2;
  expect(seen).toEqual([1, 2]);
  stop();
  expect(set.delete(raw)).toBe(true);
  expect(set.size).toBe(0);
  expect(set.has(proxy)).toBe(false);
  set.add(raw);
  expect(set.delete(proxy)).toBe(true);
  expect(set.has(raw)).toBe(false);
  expect(set.delete(proxy)).toBe(false);
});

test("initial plain-object members of a Set are reachable by raw and proxy", () => {
  const raw = { id: 1 };
  const set = reactive(new Set([raw]));
  expect(set.has(raw)).toBe(true);
  expect(set.has(reactive(raw))).toBe(true);
  expect(set.delete(reactive(raw))).toBe(true);
  expect(set.size).toBe(0);
});

test("has tracks object members by identity across raw and proxy lookups", () => {
  const a = { n: 1 },
    b = { n: 2 };
  const set = reactive(new Set<{ n: number }>());
  const byRaw = track(() => set.has(a));
  const byProxy = track(() => set.has(reactive(a)));
  set.add(b);
  expect(byRaw.seen).toEqual([false]);
  expect(byProxy.seen).toEqual([false]);
  set.add(a);
  expect(byRaw.seen).toEqual([false, true]);
  expect(byProxy.seen).toEqual([false, true]);
  byRaw.stop();
  byProxy.stop();
});

test("forEach passes wrapped values, thisArg and the proxy as third argument", () => {
  const raw = { n: 1 };
  const set = reactive(new Set<{ n: number }>([raw]));
  const context = { tag: "ctx" };
  const calls: Array<{
    value: unknown;
    key: unknown;
    target: unknown;
    self: unknown;
  }> = [];
  set.forEach(function (this: unknown, value, key, target) {
    calls.push({ value, key, target, self: this });
  }, context);
  expect(calls.length).toBe(1);
  expect(calls[0]!.self).toBe(context);
  expect(calls[0]!.target).toBe(set);
  expect(isReactive(calls[0]!.value)).toBe(true);
  expect(calls[0]!.value).toBe(reactive(raw));
  expect(calls[0]!.key).toBe(calls[0]!.value);
});

test("iteration of object values and entries yields native reactive wrappers", () => {
  const first = { n: 1 },
    second = { n: 2 };
  const set = reactive(new Set([first, second]));
  const viaIterator = [...set];
  const viaValues = [...set.values()];
  const viaKeys = [...set.keys()];
  for (const list of [viaIterator, viaValues, viaKeys]) {
    expect(list.length).toBe(2);
    expect(list[0]).toBe(reactive(first));
    expect(list[1]).toBe(reactive(second));
    expect(list.every(isReactive)).toBe(true);
  }
  const entries = [...set.entries()];
  expect(entries.length).toBe(2);
  entries.forEach(([key, value], index) => {
    const expected = reactive(index === 0 ? first : second);
    expect(isReactive(key)).toBe(true);
    expect(isReactive(value)).toBe(true);
    expect(key).toBe(expected);
    expect(value).toBe(expected);
  });
  const looped: unknown[] = [];
  for (const value of set) looped.push(value);
  expect(looped[0]).toBe(reactive(first));
});

test("shallowRef keeps a Set raw and non-reactive", () => {
  const raw = new Set([1]);
  const state = shallowRef(raw);
  expect(state.value).toBe(raw);
  expect(isReactive(state.value)).toBe(false);
  const { seen, stop } = track(() => state.value.size);
  raw.add(2);
  expect(seen).toEqual([1]);
  state.value = new Set([1, 2, 3]);
  expect(seen).toEqual([1, 3]);
  stop();
});

test("owner disposal stops effects that track a Set", () => {
  const set = reactive(new Set<number>());
  const seen: number[] = [];
  const has: boolean[] = [];
  const stopOwner = createRoot((stop) => {
    watchSyncEffect(() => {
      seen.push(set.size);
    });
    watchSyncEffect(() => {
      has.push(set.has(1));
    });
    return stop;
  });
  set.add(1);
  expect(seen).toEqual([0, 1]);
  expect(has).toEqual([false, true]);
  stopOwner();
  set.add(2);
  set.delete(1);
  set.clear();
  expect(seen).toEqual([0, 1]);
  expect(has).toEqual([false, true]);
});

test("explicit stop detaches a Set effect", () => {
  const set = reactive(new Set<number>());
  const { seen, stop } = track(() => set.size);
  set.add(1);
  stop();
  set.add(2);
  expect(seen).toEqual([0, 1]);
});

test("Sets do not unwrap stored Ref values", () => {
  const count = ref(1);
  const set = reactive(new Set<unknown>());
  set.add(count);
  expect(set.has(count)).toBe(true);
  expect(set.has(1)).toBe(false);
  const [stored] = [...set];
  expect(isRef(stored)).toBe(true);
  expect(stored).toBe(count);
  set.forEach((value) => {
    expect(value).toBe(count);
  });
  const [[key, value]] = [...set.entries()];
  expect(key).toBe(count);
  expect(value).toBe(count);
  count.value = 2;
  expect(set.size).toBe(1);
  expect(set.delete(count)).toBe(true);
});

test("non-extensible Sets remain opaque through reactive and deep refs", () => {
  for (const freeze of [Object.freeze, Object.seal, Object.preventExtensions]) {
    const source = freeze(new Set<string>());
    expect(reactive(source)).toBe(source);
    expect(isReactive(reactive(source))).toBe(false);
    const value = ref(source);
    expect(value.value).toBe(source);
    const effect = track(() => value.value.has("a"));
    source.add("a");
    expect(effect.seen).toEqual([false]);
    effect.stop();
  }
});
