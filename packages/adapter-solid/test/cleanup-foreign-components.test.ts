import { test, expect } from "bun:test";
import { createRoot } from "../src/cleanup-policy";
import { h as solidH } from "../src/component-factory";
import { createComponent } from "@tschk/moonshine-dom/component";
import { withRuneScheduler } from "../../adapter-svelte/src/pre";
import { onDestroy } from "../../adapter-svelte/src/svelte";
function sourceSvelte(trace: string[]) {
  return () =>
    withRuneScheduler(() => {
      onDestroy(() => trace.push("first"));
      onDestroy(() => trace.push("last"));
      return null;
    });
}
test("known Svelte scheduler reset preserves onDestroy order through both dispatch frames", () => {
  const direct: string[] = [],
    marked: string[] = [];
  const stop = createRoot((dispose) => {
    solidH(sourceSvelte(direct), {});
    return dispose;
  });
  stop();
  const stopMarked = createRoot((dispose) => {
    createComponent(sourceSvelte(marked), {}, "dom");
    return dispose;
  });
  stopMarked();
  expect(direct).toEqual(["first", "last"]);
  expect(marked).toEqual(["first", "last"]);
});
