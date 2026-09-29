import { describe, expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import { createBridgedReadable, fromMoonshineSignal } from "../src/index";

describe("@tschk/moonshine-astro", () => {
  test("readable get/subscribe follow the moonshine signal", () => {
    const ms = createSignal(1);
    const r = fromMoonshineSignal(ms);
    expect(r.get()).toBe(1);
    const seen: number[] = [];
    const stop = r.subscribe((v) => seen.push(v));
    ms.set(3);
    stop();
    expect(seen).toEqual([1, 3]);
  });

  test("createBridgedReadable owns a moonshine signal", () => {
    const r = createBridgedReadable("a");
    expect(r.get()).toBe("a");
  });
});
