import { describe, expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import { createBridgedWritable, fromMoonshineSignal } from "../src/index";

describe("@tschk/moonshine-svelte", () => {
  test("writable set writes through to the moonshine signal", () => {
    const ms = createSignal(1);
    const store = fromMoonshineSignal(ms);
    store.set(5);
    expect(ms()).toBe(5);
    store.update((n) => n + 1);
    expect(ms()).toBe(6);
  });

  test("subscribe sees moonshine writes", () => {
    const ms = createSignal(0);
    const store = fromMoonshineSignal(ms);
    const seen: number[] = [];
    const stop = store.subscribe((v) => seen.push(v));
    ms.set(2);
    stop();
    expect(seen).toEqual([0, 2]);
  });

  test("createBridgedWritable owns a moonshine signal", () => {
    const store = createBridgedWritable("a");
    store.set("b");
    let value = "";
    store.subscribe((v) => {
      value = v;
    })();
    expect(value).toBe("b");
  });
});
