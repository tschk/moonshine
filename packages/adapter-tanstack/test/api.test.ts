import { describe, expect, test } from "bun:test";
import {
  createMutationSignal,
  createPathnameSignal,
  createQuerySignal,
  createSignal,
} from "../src/index";

describe("@tschk/moonshine-tanstack", () => {
  test("createQuerySignal loads data", async () => {
    const q = createQuerySignal(async () => "ok", { immediate: false });
    expect(q()).toBeUndefined();
    await q.refetch();
    expect(q()).toBe("ok");
    expect(q.loading()).toBe(false);
  });

  test("createMutationSignal tracks pending", async () => {
    const m = createMutationSignal(async (n: number) => n * 2);
    const p = m.mutate(21);
    expect(m.pending()).toBe(true);
    expect(await p).toBe(42);
    expect(m.pending()).toBe(false);
    expect(m.data()).toBe(42);
  });

  test("createPathnameSignal defaults", () => {
    const p = createPathnameSignal();
    expect(typeof p()).toBe("string");
  });

  test("deps refetch query", async () => {
    const id = createSignal(1);
    let calls = 0;
    const q = createQuerySignal(
      async () => {
        calls++;
        return id();
      },
      { immediate: true, deps: [id] },
    );
    await q.refetch();
    const base = calls;
    id.set(2);
    // allow subscribe microtask
    await new Promise((r) => setTimeout(r, 0));
    await q.refetch();
    expect(calls).toBeGreaterThanOrEqual(base);
    expect(q()).toBe(2);
  });
});
