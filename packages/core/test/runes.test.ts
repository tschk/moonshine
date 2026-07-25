import { describe, expect, test } from "bun:test";
import { derived, effect, state } from "../src/runes";

describe("runes", () => {
  test("state is createSignal", () => {
    const count = state(0);
    expect(count()).toBe(0);
    count.set(3);
    expect(count()).toBe(3);
  });

  test("derived is createMemo", () => {
    const n = state(2);
    const doubled = derived(() => n() * 2);
    expect(doubled()).toBe(4);
    n.set(5);
    expect(doubled()).toBe(10);
  });

  test("effect tracks deps and unsubscribes", async () => {
    const n = state(1);
    let hits = 0;
    const stop = effect(() => {
      void n();
      hits++;
    });
    expect(hits).toBe(1);
    n.set(2);
    await Promise.resolve();
    expect(hits).toBe(2);
    stop();
    n.set(3);
    await Promise.resolve();
    expect(hits).toBe(2);
  });
});
