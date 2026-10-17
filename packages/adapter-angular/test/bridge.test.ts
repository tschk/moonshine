import { describe, expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import { createBridgedSignal, fromMoonshineSignal } from "../src/index";

describe("@tschk/moonshine-angular", () => {
  test("set/update write through to the moonshine signal", () => {
    const ms = createSignal(1);
    const sig = fromMoonshineSignal(ms);
    sig.set(5);
    expect(ms()).toBe(5);
    expect(sig()).toBe(5);
    sig.update((n) => n + 1);
    expect(ms()).toBe(6);
  });

  test("createBridgedSignal owns a moonshine signal", () => {
    const sig = createBridgedSignal("a");
    sig.set("b");
    expect(sig()).toBe("b");
  });
  test("set and update preserve literal function values without calling them", () => {
    let calls = 0;
    const first = () => 1;
    const second = () => {
      calls++;
      return 2;
    };
    const value = createBridgedSignal(first);
    value.set(second);
    expect(value()).toBe(second);
    value.update((previous) => {
      expect(previous).toBe(second);
      return first;
    });
    expect(value()).toBe(first);
    expect(calls).toBe(0);
  });
});
