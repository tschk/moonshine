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
});
