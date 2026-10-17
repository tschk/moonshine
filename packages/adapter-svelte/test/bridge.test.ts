import { describe, expect, test } from "bun:test";
import { batch, createSignal } from "@tschk/moonshine";
import { get } from "../src/store";
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

  test("initial subscriber writes are observed and subscribers share the kernel subscription", () => {
    const signal = createSignal(0);
    const subscribe = signal.subscribe;
    let opened = 0;
    let closed = 0;
    signal.subscribe = (run) => {
      opened++;
      const stop = subscribe(run);
      return () => {
        closed++;
        stop();
      };
    };
    const store = fromMoonshineSignal(signal);
    const seen: number[] = [];
    const stop = store.subscribe((value) => {
      seen.push(value);
      if (value === 0) store.set(1);
    });
    const another = store.subscribe(() => {});
    expect(seen).toEqual([0, 1]);
    expect(opened).toBe(1);
    stop();
    expect(closed).toBe(0);
    another();
    another();
    expect(closed).toBe(1);
    signal.set(4);
    expect(get(store)).toBe(4);
    expect(opened).toBe(2);
    expect(closed).toBe(2);
  });

  test("store object writes notify once, including inside a kernel batch", () => {
    const initial = { value: 1 };
    const signal = createSignal(initial);
    const store = fromMoonshineSignal(signal);
    const seen: number[] = [];
    const stop = store.subscribe((value) => seen.push(value.value));
    store.set(initial);
    store.set({ value: 2 });
    store.update((value) => {
      value.value = 3;
      return value;
    });
    batch(() => {
      store.set({ value: 4 });
      store.set({ value: 5 });
    });
    expect(seen).toEqual([1, 1, 2, 3, 4, 5]);
    expect(signal()).toEqual({ value: 5 });
    stop();
  });

  test("function-valued set stores the function instead of invoking it", () => {
    const store = createBridgedWritable(() => 1);
    const next = () => 7;
    store.set(next);
    expect(get(store)).toBe(next);
    expect(get(store)()).toBe(7);
  });
});
