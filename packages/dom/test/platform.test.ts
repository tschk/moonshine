import { expect, test } from "bun:test";
import { sourceRealm } from "../src/platform";

test("compiler realm reads the current global binding without caching it", () => {
  const realm = globalThis;
  const descriptor = Object.getOwnPropertyDescriptor(realm, "globalThis")!;
  const first = {};
  const second = {};
  let reads = 0;
  let observedFirst: unknown;
  let observedSecond: unknown;
  try {
    Object.defineProperty(realm, "globalThis", {
      configurable: true,
      get: () => (++reads === 1 ? first : second),
    });
    observedFirst = sourceRealm();
    observedSecond = sourceRealm();
  } finally {
    Object.defineProperty(realm, "globalThis", descriptor);
  }
  expect(observedFirst).toBe(first);
  expect(observedSecond).toBe(second);
  expect(reads).toBe(2);
  expect(sourceRealm()).toBe(realm);
});
