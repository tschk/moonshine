import { describe, expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import { createBridgedRef, fromMoonshineSignal } from "../src/index";

describe("@tschk/moonshine-vue", () => {
  test("ref value writes through to the moonshine signal", () => {
    const ms = createSignal(1);
    const r = fromMoonshineSignal(ms);
    r.value = 5;
    expect(ms()).toBe(5);
    expect(r.value).toBe(5);
  });

  test("createBridgedRef owns a moonshine signal", () => {
    const r = createBridgedRef("a");
    r.value = "b";
    expect(r.value).toBe("b");
  });
});
