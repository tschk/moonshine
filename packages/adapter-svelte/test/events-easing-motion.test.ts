import { describe, expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import * as easing from "../src/easing";
import { on } from "../src/events";
import {
  Spring,
  Tween,
  prefersReducedMotion,
  spring,
  tweened,
} from "../src/motion";
import { get } from "../src/store";

describe("@tschk/moonshine-svelte events, easing, and motion", () => {
  test("on() attaches and removes DOM/EventTarget listeners with target context", () => {
    const target = new EventTarget();
    const received: string[] = [];

    const off = on(target, "custom-ping", function (event) {
      expect(this).toBe(target);
      received.push(event.type);
    });

    target.dispatchEvent(new Event("custom-ping"));
    expect(received).toEqual(["custom-ping"]);

    off();
    target.dispatchEvent(new Event("custom-ping"));
    expect(received).toEqual(["custom-ping"]);
  });

  test("easing functions boundary values at t=0, t=0.5, and t=1", () => {
    const names = [
      "linear",
      "backIn",
      "backOut",
      "backInOut",
      "bounceIn",
      "bounceOut",
      "bounceInOut",
      "circIn",
      "circOut",
      "circInOut",
      "cubicIn",
      "cubicOut",
      "cubicInOut",
      "elasticIn",
      "elasticOut",
      "elasticInOut",
      "expoIn",
      "expoOut",
      "expoInOut",
      "quadIn",
      "quadOut",
      "quadInOut",
      "quartIn",
      "quartOut",
      "quartInOut",
      "quintIn",
      "quintOut",
      "quintInOut",
      "sineIn",
      "sineOut",
      "sineInOut",
    ] as const;

    for (const name of names) {
      const fn = easing[name];
      expect(typeof fn).toBe("function");
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
      const mid = fn(0.5);
      expect(Number.isFinite(mid)).toBe(true);
    }
    expect(easing.linear(0.25)).toBe(0.25);
    expect(easing.quadIn(0.5)).toBe(0.25);
    expect(easing.cubicIn(0.5)).toBe(0.125);
  });

  test("Spring, Tween, spring store, tweened store, and prefersReducedMotion", async () => {
    expect(typeof prefersReducedMotion.current).toBe("boolean");

    const s = new Spring({ x: 0, y: 10 }, { stiffness: 0.3, damping: 0.8 });
    expect(s.current).toEqual({ x: 0, y: 10 });
    expect(s.target).toEqual({ x: 0, y: 10 });

    await s.set({ x: 50, y: 20 }, { hard: true });
    expect(s.current).toEqual({ x: 50, y: 20 });
    expect(s.target).toEqual({ x: 50, y: 20 });

    await s.set({ x: 100, y: 40 });
    expect(s.current).toEqual({ x: 100, y: 40 });

    const source = createSignal(5);
    let stopRoot!: () => void;
    let derivedSpring!: Spring<number>;
    createRoot((dispose) => {
      stopRoot = dispose;
      derivedSpring = Spring.of(() => source(), { stiffness: 1, damping: 1 });
    });
    expect(derivedSpring.current).toBe(5);
    source.set(() => 15);
    expect(derivedSpring.target).toBe(15);
    expect(derivedSpring.current).toBe(15);
    stopRoot();

    const tw = new Tween([0, 10], { duration: 15, easing: easing.cubicOut });
    expect(tw.current).toEqual([0, 10]);
    await tw.set([100, 20]);
    expect(tw.current).toEqual([100, 20]);
    expect(tw.target).toEqual([100, 20]);

    const twZero = new Tween(new Date(1000), { duration: 0 });
    await twZero.set(new Date(5000));
    expect(twZero.current.getTime()).toBe(5000);

    const legacySpring = spring(10, { stiffness: 1, damping: 1 });
    expect(get(legacySpring)).toBe(10);
    await legacySpring.update((target) => target + 5, { hard: true });
    expect(get(legacySpring)).toBe(15);

    const legacyTween = tweened({ count: 1 }, { duration: 0 });
    expect(get(legacyTween)).toEqual({ count: 1 });
    await legacyTween.set({ count: 9 });
    expect(get(legacyTween)).toEqual({ count: 9 });
  });
});
