import { expect, test } from "bun:test";
import { createStore, createMutable, unwrap } from "../src/store";
import { createComputed, createRoot } from "../src/reactive";
const opaqueCallback = () => 1;
test("unwrap returns original mutable and readonly store identities including nested objects", () => {
  const nested = { count: 1 },
    source = { nested };
  const [readonly] = createStore(source);
  const mutable = createMutable(source);
  expect(unwrap(readonly)).toBe(source);
  expect(unwrap(mutable)).toBe(source);
  expect(unwrap(readonly.nested)).toBe(nested);
  expect(unwrap(mutable.nested)).toBe(nested);
  expect(unwrap(source)).toBe(source);
  expect(unwrap(null)).toBeNull();
  expect(unwrap(2)).toBe(2);
});
test("unwrap does not subscribe reads or notify through raw mutations", () => {
  const source = { count: 1 },
    mutable = createMutable(source);
  let runs = 0,
    observed = 0;
  createRoot((stop) => {
    createComputed(() => {
      runs++;
      observed = unwrap(mutable).count;
    });
    mutable.count = 2;
    expect(runs).toBe(1);
    expect(observed).toBe(1);
    unwrap(mutable).count = 3;
    expect(mutable.count).toBe(3);
    expect(runs).toBe(1);
    stop();
  });
});

test("unwrap normalizes proxies inside ordinary containers while retaining cycles and accessors", () => {
  const source = { count: 1 },
    proxy = createMutable(source);
  let reads = 0;
  const container: any = {
    list: [proxy],
    self: null,
    get accessor() {
      reads++;
      return proxy;
    },
  };
  container.self = container;
  expect(unwrap(container)).toBe(container);
  expect(container.list[0]).toBe(source);
  expect(container.self).toBe(container);
  expect(reads).toBe(0);
  expect(
    Object.getOwnPropertyDescriptor(container, "accessor")?.get,
  ).toBeFunction();
});
test("frozen containers copy before replacing embedded proxies", () => {
  const source = { count: 1 },
    proxy = createMutable(source);
  const original = Object.freeze({ nested: proxy });
  const result = unwrap(original);
  expect(result).not.toBe(original);
  expect(result.nested).toBe(source);
  expect(original.nested).toBe(proxy);
  const array = Object.freeze([proxy]);
  const next = unwrap(array);
  expect(next).not.toBe(array);
  expect(next[0]).toBe(source);
  expect(array[0]).toBe(proxy);
});
test("unwrap leaves opaque values and function identities intact", () => {
  const date = new Date(),
    set = new Set();
  expect(unwrap(opaqueCallback)).toBe(opaqueCallback);
  expect(unwrap(date)).toBe(date);
  expect(unwrap(set)).toBe(set);
});
