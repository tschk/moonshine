import { describe, expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import { createBridgedRef, fromMoonshineSignal } from "../src/index";

describe("@tschk/moonshine-nuxt", () => {
  test("ref value writes through to the moonshine signal", () => {
    const ms = createSignal(1);
    const r = fromMoonshineSignal(ms);
    r.value = 9;
    expect(ms()).toBe(9);
    expect(r.value).toBe(9);
  });

  test("createBridgedRef owns a moonshine signal", () => {
    const r = createBridgedRef(false);
    r.value = true;
    expect(r.value).toBe(true);
  });
});
