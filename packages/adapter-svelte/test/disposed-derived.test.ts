import { test, expect } from "bun:test";
import { createDerived } from "../src/derived";
import {
  createRoot,
  createSignal,
  createComputed,
} from "@tschk/moonshine-dom/reactive";
import { collectDeps } from "@tschk/moonshine/tracking";
import {
  holdHistory,
  releaseHistory,
  withHistoryCleanup,
} from "../src/history";
import { createState } from "../src/state";
test("unread disposed value computes latest once without tracking caller or retaining notifications", () => {
  const [n, set] = createSignal(1);
  let calls = 0,
    d!: ReturnType<typeof createDerived<number>>;
  const stop = createRoot((dispose) => {
    d = createDerived(() => {
      calls++;
      return n() * 2;
    });
    return dispose;
  });
  stop();
  set(3);
  const deps = collectDeps(() => expect(d.value).toBe(6));
  expect(deps).toHaveLength(0);
  set(4);
  expect(d.value).toBe(6);
  expect(calls).toBe(1);
});
test("first failure is frozen and preserves original error; no retries", () => {
  let calls = 0;
  const error = { failure: true };
  let d!: ReturnType<typeof createDerived>;
  const stop = createRoot((dispose) => {
    d = createDerived(() => {
      calls++;
      throw error;
    });
    return dispose;
  });
  stop();
  for (let i = 0; i < 2; i++) {
    try {
      void d.value;
      throw Error("not thrown");
    } catch (e) {
      expect(e).toBe(error);
    }
  }
  expect(calls).toBe(1);
});
test("dependency writes and attached owned work remain rejected and frozen", () => {
  for (const owned of [false, true]) {
    const [n, set] = createSignal(1);
    let calls = 0,
      effects = 0,
      d!: ReturnType<typeof createDerived>;
    const stop = createRoot((dispose) => {
      d = createDerived(() => {
        calls++;
        const value = n();
        if (owned)
          createComputed(() => {
            effects++;
          });
        else set(value + 1);
        return value;
      });
      return dispose;
    });
    stop();
    let error: unknown;
    try {
      void d.value;
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    try {
      void d.value;
    } catch (e) {
      expect(e).toBe(error);
    }
    expect(calls).toBe(1);
    expect(effects).toBe(0);
  }
});
test("override before first read discovers inputs once and retains its literal after disposal", () => {
  let calls = 0,
    d!: ReturnType<typeof createDerived<number>>;
  const stop = createRoot((dispose) => {
    d = createDerived(() => {
      calls++;
      return 1;
    });
    d.value = 99;
    return dispose;
  });
  stop();
  expect(d.value).toBe(99);
  expect(calls).toBe(1);
});
test("cleanup historical read does not freeze later live first read", () => {
  holdHistory();
  try {
    const n = createState(1);
    let calls = 0,
      d!: ReturnType<typeof createDerived<number>>;
    const stop = createRoot((dispose) => {
      d = createDerived(() => {
        calls++;
        return n.value;
      });
      return dispose;
    });
    n.value = 2;
    stop();
    withHistoryCleanup(() => expect(d.value).toBe(1));
    expect(d.value).toBe(2);
    n.value = 3;
    expect(d.value).toBe(2);
    expect(calls).toBe(2);
  } finally {
    releaseHistory();
  }
});

test("disposed self reads fail once instead of recursively overflowing", () => {
  let calls = 0,
    d!: ReturnType<typeof createDerived<number>>;
  const stop = createRoot((dispose) => {
    d = createDerived(() => {
      calls++;
      return d.value;
    });
    return dispose;
  });
  stop();
  expect(() => d.value).toThrow("disposed evaluation");
  expect(() => d.value).toThrow("disposed evaluation");
  expect(calls).toBe(1);
});
