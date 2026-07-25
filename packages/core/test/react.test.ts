import { describe, expect, test } from "bun:test";
import {
  createApp,
  createMoonshineApp,
  createSignal,
  createStore,
  useSignal,
  useStore,
} from "../src/react";
import { createSignal as coreSignal } from "../src/index";

describe("react bridge", () => {
  test("re-exports signal helpers", () => {
    const a = createSignal(1);
    const b = coreSignal(1);
    expect(a()).toBe(b());
    a.set(2);
    expect(a()).toBe(2);
  });

  test("exports createApp alias", () => {
    expect(createApp).toBe(createMoonshineApp);
    expect(typeof useSignal).toBe("function");
    expect(typeof useStore).toBe("function");
  });

  test("useStore rejects non-store", () => {
    expect(() => useStore({} as { n: number })).toThrow(/createStore/);
  });

  test("createStore proxy is accepted by getStoreRoot path", () => {
    const [store] = createStore({ n: 1 });
    // useStore needs React dispatcher; only assert createStore still works here
    expect(store.n).toBe(1);
  });
});
