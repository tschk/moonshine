import { describe, expect, test } from "bun:test";
import { computed, effect, resource, signal, untracked } from "../src/index";

describe("@tschk/moonshine-angular", () => {
  test("signal set/update/asReadonly", () => {
    const n = signal(1);
    expect(n()).toBe(1);
    n.set(2);
    expect(n()).toBe(2);
    n.update((x) => x + 1);
    expect(n()).toBe(3);
    expect(n.asReadonly()()).toBe(3);
  });

  test("computed tracks signal", () => {
    const n = signal(2);
    const d = computed(() => n() * 2);
    expect(d()).toBe(4);
    n.set(5);
    expect(d()).toBe(10);
  });

  test("effect runs and tears down", async () => {
    const n = signal(0);
    let hits = 0;
    const stop = effect(() => {
      n();
      hits++;
    });
    expect(hits).toBeGreaterThanOrEqual(1);
    n.set(1);
    await new Promise((r) => queueMicrotask(r));
    expect(hits).toBeGreaterThanOrEqual(2);
    stop();
    const at = hits;
    n.set(2);
    await new Promise((r) => queueMicrotask(r));
    expect(hits).toBe(at);
  });

  test("untracked skips dep", () => {
    const a = signal(1);
    const b = signal(10);
    const c = computed(() => a() + untracked(() => b()));
    expect(c()).toBe(11);
    b.set(100);
    expect(c()).toBe(11);
    a.set(2);
    expect(c()).toBe(102);
  });

  test("resource loads", async () => {
    const r = resource(async () => "x", { immediate: false });
    await r.refetch();
    expect(r()).toBe("x");
  });
});
