import { describe, expect, test } from "bun:test";
import {
  clearLoaderSignals,
  createLoaderResource,
  createSearchParamSignal,
  createSignal,
  useLoaderSignal,
} from "../src/index";

describe("@tschk/moonshine-remix", () => {
  test("exports host-react surface", () => {
    expect(typeof createSignal).toBe("function");
  });

  test("useLoaderSignal caches by key and updates seed", () => {
    clearLoaderSignals();
    const a = useLoaderSignal({ id: 1 }, "user");
    const b = useLoaderSignal({ id: 1 }, "user");
    expect(a).toBe(b);
    expect(a().id).toBe(1);
    useLoaderSignal({ id: 2 }, "user");
    expect(a().id).toBe(2);
    clearLoaderSignals();
  });

  test("createLoaderResource fetches", async () => {
    const r = createLoaderResource(async () => 42, { immediate: true });
    await r.refetch();
    expect(r()).toBe(42);
    expect(r.status()).toBe("ready");
  });

  test("createSearchParamSignal reads fallback without window write crash", () => {
    const s = createSearchParamSignal("q", "x");
    expect(s()).toBe("x");
    s.set("y");
    expect(s()).toBe("y");
  });
});
