import { test, expect } from "bun:test";
import {
  setStoreValue,
  mutateStoreValue,
  mutateServerStore,
  updateStoreValue,
} from "../src/store-write.js";
function make<T>(initial: T) {
  let value = initial;
  let reads = 0;
  const writes: T[] = [];
  const store = {
    subscribe(run: (v: T) => void) {
      reads++;
      run(value);
      return () => {};
    },
    set(next: T) {
      expect(this).toBe(store);
      value = next;
      writes.push(next);
    },
  };
  return {
    store,
    writes,
    get reads() {
      return reads;
    },
  };
}
test("direct writes never subscribe, retain literal function payload and exact return", () => {
  const fn = () => 3;
  const source = make(() => 1);
  expect(setStoreValue(source.store, fn)).toBe(fn);
  expect(source.writes).toEqual([fn]);
  expect(source.reads).toBe(0);
});
test("update follows official addition coercion and preserves prefix/postfix results", () => {
  const source = make(3);
  expect(updateStoreValue(source.store, 3, 1, false)).toBe(3);
  expect(updateStoreValue(source.store, 4, -1, true)).toBe(3);
  expect(source.writes).toEqual([4, 3]);
  const string = make("2");
  expect(updateStoreValue(string.store, "2", -1, true)).toBe("2-1");
  const bigint = make(1n);
  expect(() => updateStoreValue(bigint.store, 1n, 1, false)).toThrow(TypeError);
  expect(bigint.writes).toEqual([]);
});
test("member writes return expression separately from payload; SSR reads captured source after expression", () => {
  const source = make({ count: 1 });
  const payload = { count: 8 };
  expect(mutateStoreValue(source.store, 4, payload)).toBe(4);
  expect(source.writes).toEqual([payload]);
  const trace: string[] = [];
  const ref = {
    get(store: typeof source.store) {
      expect(store).toBe(source.store);
      trace.push("read");
      return payload;
    },
  };
  const expression = () => {
    trace.push("expression");
    return 5;
  };
  expect(mutateServerStore(ref, source.store, expression())).toBe(5);
  expect(trace).toEqual(["expression", "read"]);
});
