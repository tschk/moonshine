import { expect, test } from "bun:test";
import { createMemo as kernelMemo, createSignal } from "@tschk/moonshine";
import { Show } from "../src/control";
import { createRoot, onCleanup } from "../src/reactive";

test("compiler lazy choice cache postpones retiring condition reads", () => {
  const input = createSignal<{ child: { value: number } | null }>({
    child: { value: 1 },
  });
  let reads = 0;
  let stop!: () => void;
  const selected = createRoot((dispose) => {
    stop = dispose;
    const raw = kernelMemo(() => {
      reads++;
      return input().child!.value;
    });
    return Show(
      { when: raw, children: () => "yes", fallback: () => "no" },
      (read) => read,
      kernelMemo,
    );
  });
  expect(selected()).toBe("yes");
  expect(reads).toBe(1);
  expect(() => input.set({ child: null })).not.toThrow();
  expect(reads).toBe(1);
  stop();
  expect(selected()).toBeUndefined();
  expect(reads).toBe(1);
});

test("default Show still caches repeated reads and preserves branch ownership", () => {
  const input = createSignal(1);
  let reads = 0;
  createRoot((stop) => {
    const selected = Show(
      {
        when: () => {
          reads++;
          return input();
        },
        children: () => "yes",
      },
      (read) => read,
    );
    expect(selected()).toBe("yes");
    expect(selected()).toBe("yes");
    expect(reads).toBe(1);
    stop();
    expect(selected()).toBeUndefined();
  });
});

test("lazy cache retires guarded branch once without repeating condition reads", () => {
  const input = createSignal(1);
  let reads = 0;
  let setups = 0;
  let cleanups = 0;
  let guarded: (() => number) | undefined;
  createRoot((stop) => {
    const raw = kernelMemo(() => {
      reads++;
      return input();
    });
    const selected = Show(
      {
        when: raw,
        children: (read) => {
          setups++;
          guarded = read;
          onCleanup(() => cleanups++);
          return "yes";
        },
        fallback: () => "no",
      },
      (read) => read,
      kernelMemo,
    );
    expect(selected()).toBe("yes");
    expect(selected()).toBe("yes");
    expect(guarded!()).toBe(1);
    expect(reads).toBe(1);
    input.set(2);
    expect(reads).toBe(1);
    expect(selected()).toBe("yes");
    expect(guarded!()).toBe(2);
    expect(setups).toBe(1);
    expect(reads).toBe(2);
    input.set(0);
    expect(cleanups).toBe(0);
    expect(selected()).toBe("no");
    expect(cleanups).toBe(1);
    expect(() => guarded!()).toThrow("Show branch is inactive");
    expect(reads).toBe(3);
    expect(selected()).toBe("no");
    stop();
    expect(selected()).toBeUndefined();
    expect(cleanups).toBe(1);
    expect(reads).toBe(3);
  });
});
