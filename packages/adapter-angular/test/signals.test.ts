import { describe, expect, test } from "bun:test";
import { batch, createSignal as createMsSignal } from "@tschk/moonshine";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  computed,
  createBridgedSignal,
  effect,
  fromMoonshineSignal,
  isSignal,
  isWritableSignal,
  linkedSignal,
  signal,
  untracked,
} from "../src/signals";

describe("@tschk/moonshine-angular signals", () => {
  test("signal supports set, update, custom equal, and asReadonly", () => {
    const count = signal(1);
    expect(count()).toBe(1);
    expect(isSignal(count)).toBe(true);
    expect(isWritableSignal(count)).toBe(true);

    count.set(2);
    expect(count()).toBe(2);

    count.update((n) => n + 3);
    expect(count()).toBe(5);

    const ro = count.asReadonly();
    expect(ro).toBe(count.asReadonly());
    expect(ro()).toBe(5);
    expect(isSignal(ro)).toBe(true);
    expect(isWritableSignal(ro)).toBe(false);
    expect("set" in ro).toBe(false);
    expect("update" in ro).toBe(false);

    count.set(8);
    expect(ro()).toBe(8);

    const byId = signal(
      { id: 1, label: "first" },
      { equal: (a, b) => a.id === b.id },
    );
    let runs = 0;
    const label = computed(() => {
      runs++;
      return byId().label;
    });
    expect(label()).toBe("first");
    expect(runs).toBe(1);

    byId.set({ id: 1, label: "ignored" });
    expect(label()).toBe("first");
    expect(runs).toBe(1);

    byId.set({ id: 2, label: "second" });
    expect(label()).toBe("second");
    expect(runs).toBe(2);
  });

  test("fromMoonshineSignal and createBridgedSignal satisfy signal predicates and asReadonly", () => {
    const raw = createMsSignal(10);
    const bridged = fromMoonshineSignal(raw);
    const owned = createBridgedSignal("hello");

    expect(isSignal(bridged)).toBe(true);
    expect(isWritableSignal(bridged)).toBe(true);
    expect(isSignal(owned)).toBe(true);
    expect(isWritableSignal(owned)).toBe(true);
    expect(isSignal(() => 1)).toBe(false);
    expect(isWritableSignal(() => 1)).toBe(false);
    expect(isSignal(null)).toBe(false);

    const ro = bridged.asReadonly();
    expect(ro).toBe(bridged.asReadonly());
    expect(isSignal(ro)).toBe(true);
    expect(isWritableSignal(ro)).toBe(false);
    bridged.set(25);
    expect(ro()).toBe(25);
    expect(raw()).toBe(25);
  });

  test("computed is lazy, memoized, and supports custom equality", () => {
    let calls = 0;
    const base = signal(2);
    const doubled = computed(() => {
      calls++;
      return base() * 2;
    });

    expect(calls).toBe(0);
    expect(isSignal(doubled)).toBe(true);
    expect(isWritableSignal(doubled)).toBe(false);

    expect(doubled()).toBe(4);
    expect(doubled()).toBe(4);
    expect(calls).toBe(1);

    let parityCalls = 0;
    const parity = computed(
      () => {
        parityCalls++;
        return { even: doubled() % 2 === 0, value: doubled() };
      },
      { equal: (a, b) => a.even === b.even },
    );
    let downstreamCalls = 0;
    const summary = computed(() => {
      downstreamCalls++;
      return parity().even ? "even" : "odd";
    });

    expect(summary()).toBe("even");
    expect(parityCalls).toBe(1);
    expect(downstreamCalls).toBe(1);

    base.set(3);
    expect(summary()).toBe("even");
    expect(parityCalls).toBe(2);
    expect(downstreamCalls).toBe(1);
  });

  test("computed disallows writing to signals", () => {
    const a = signal(1);
    const b = signal(2);
    const bad = computed(() => {
      b.set(a() + 1);
      return a();
    });
    expect(() => bad()).toThrow(
      /Cannot write to signals inside a reactive computation/,
    );
  });

  test("shorthand linkedSignal supports manual overrides and resets when dependencies change", () => {
    const a = signal(1);
    const b = signal(2);
    let computeCount = 0;
    const total = linkedSignal(() => {
      computeCount++;
      return a() + b();
    });

    expect(computeCount).toBe(0);
    expect(isSignal(total)).toBe(true);
    expect(isWritableSignal(total)).toBe(true);
    expect(isSignal(total.asReadonly())).toBe(true);
    expect(isWritableSignal(total.asReadonly())).toBe(false);

    expect(total()).toBe(3);
    expect(computeCount).toBe(1);

    total.set(99);
    expect(total()).toBe(99);
    total.update((v) => v + 1);
    expect(total()).toBe(100);
    expect(computeCount).toBe(1);

    // Even when a() + b() recomputes to the same sum (3) after a manual override (100),
    // changing the tracked dependencies resets the linkedSignal back to 3.
    batch(() => {
      a.set(0);
      b.set(3);
    });
    expect(total()).toBe(3);
    expect(computeCount).toBe(2);
  });

  test("linkedSignal with explicit source and computation passes previous source and value", () => {
    const items = signal(["alpha", "beta", "gamma"]);
    const history: Array<{ source: string[]; value: string } | undefined> = [];
    const selected = linkedSignal({
      source: items,
      computation: (list, previous) => {
        history.push(previous);
        if (previous && list.includes(previous.value)) {
          return previous.value;
        }
        return list[0] ?? "none";
      },
    });

    expect(selected()).toBe("alpha");
    expect(history).toEqual([undefined]);

    selected.set("beta");
    expect(selected()).toBe("beta");

    items.set(["beta", "delta"]);
    expect(selected()).toBe("beta");
    expect(history).toEqual([
      undefined,
      { source: ["alpha", "beta", "gamma"], value: "beta" },
    ]);

    items.set(["delta", "epsilon"]);
    expect(selected()).toBe("delta");
    expect(history).toEqual([
      undefined,
      { source: ["alpha", "beta", "gamma"], value: "beta" },
      { source: ["beta", "delta"], value: "beta" },
    ]);
  });

  test("effect tracks signals, runs cleanups, batches updates, and respects manualCleanup", () => {
    const count = signal(0);
    const step = signal(1);
    const seen: number[] = [];
    const cleaned: number[] = [];

    const ref = effect((onCleanup) => {
      const value = count() + untracked(step);
      seen.push(value);
      onCleanup(() => {
        cleaned.push(value);
      });
    });

    expect(seen).toEqual([1]);
    expect(cleaned).toEqual([]);

    // step was read via untracked(), so updating step alone does not trigger the effect.
    step.set(10);
    expect(seen).toEqual([1]);

    batch(() => {
      count.set(2);
      count.set(5);
    });
    expect(cleaned).toEqual([1]);
    expect(seen).toEqual([1, 15]);

    ref.destroy();
    expect(cleaned).toEqual([1, 15]);

    count.set(20);
    expect(seen).toEqual([1, 15]);

    const autoSeen: number[] = [];
    const manualSeen: number[] = [];
    let manualRef!: ReturnType<typeof effect>;
    createRoot((dispose) => {
      effect(() => {
        autoSeen.push(count());
      });
      manualRef = effect(
        () => {
          manualSeen.push(count());
        },
        { manualCleanup: true },
      );
      dispose();
    });

    count.set(30);
    expect(autoSeen).toEqual([20]);
    expect(manualSeen).toEqual([20, 30]);
    manualRef.destroy();
    count.set(40);
    expect(manualSeen).toEqual([20, 30]);
  });

  test("effect supports signal writes by default, enforces allowSignalWrites: false, and skips SSR", () => {
    const count = signal(0);
    const ref = effect(() => {
      if (count() < 3) {
        count.set(count() + 1);
      }
    });
    expect(count()).toBe(3);
    ref.destroy();

    const target = signal(0);
    expect(() =>
      effect(
        () => {
          target.set(1);
        },
        { allowSignalWrites: false },
      ),
    ).toThrow(/Cannot write to signals inside a reactive computation/);

    let ssrRuns = 0;
    withSSRRendering(() => {
      const ssrRef = effect(() => {
        ssrRuns++;
      });
      ssrRef.destroy();
    });
    expect(ssrRuns).toBe(0);
  });
});
