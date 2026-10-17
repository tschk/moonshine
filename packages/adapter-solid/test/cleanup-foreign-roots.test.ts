import { expect, test } from "bun:test";
import { createRoot as solidRoot } from "../src/cleanup-policy";
import { createRoot as nativeRoot } from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import {
  createRuneRoot,
  createRuneEffect,
} from "../../adapter-svelte/src/runes";
import { tick } from "../../adapter-svelte/src/svelte";
async function run(mode: "native" | "direct" | "frame") {
  const trace: string[] = [];
  let stopRune = () => {};
  const setup = () =>
    createRuneRoot(() => {
      createRuneEffect(() => () => trace.push("a"));
      createRuneEffect(() => () => trace.push("b"));
    });
  const stop = (mode === "native" ? nativeRoot : solidRoot)((dispose) => {
    stopRune = mode === "frame" ? createComponent(setup, {}, "dom") : setup();
    return dispose;
  });
  await tick();
  stopRune();
  stop();
  return trace;
}
test("direct foreign RuneRoot inherits Solid policy; explicit native frame restores default", async () => {
  expect(await run("native")).toEqual(["a", "b"]);
  expect(await run("direct")).toEqual(["b", "a"]);
  expect(await run("frame")).toEqual(["a", "b"]);
});
test("known Svelte scheduler entry resets foreign policy and leaves Solid parent context intact", async () => {
  const { withRuneScheduler } = await import("../../adapter-svelte/src/pre");
  const { getOwner, cleanupOrderKey } =
    await import("@tschk/moonshine-dom/reactive");
  const trace: string[] = [];
  let stopRune = () => {};
  const stop = solidRoot((dispose) => {
    const parent = getOwner()!,
      context = parent.context;
    withRuneScheduler(() => {
      expect(getOwner()!.context?.has(cleanupOrderKey)).toBe(false);
      stopRune = createRuneRoot(() => {
        createRuneEffect(() => () => trace.push("a"));
        createRuneEffect(() => () => trace.push("b"));
      });
    });
    expect(parent.context).toBe(context);
    expect(context?.has(cleanupOrderKey)).toBe(true);
    return dispose;
  });
  await tick();
  stopRune();
  stop();
  expect(trace).toEqual(["a", "b"]);
});
test("native frame boundary preserves manual independent foreign-root lifetime", async () => {
  const { createSignal } = await import("@tschk/moonshine-dom/reactive");
  const [value, set] = createSignal(1);
  const trace: string[] = [];
  let stopRune = () => {};
  const stop = solidRoot((dispose) => {
    stopRune = createComponent(
      () =>
        createRuneRoot(() =>
          createRuneEffect(() => {
            const n = value();
            trace.push("run" + n);
            return () => trace.push("cleanup" + n);
          }),
        ),
      {},
      "dom",
    );
    return dispose;
  });
  await tick();
  stop();
  set(2);
  await tick();
  stopRune();
  expect(trace).toEqual(["run1", "cleanup1", "run2", "cleanup2"]);
});
