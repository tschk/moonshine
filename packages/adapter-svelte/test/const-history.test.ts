import { test, expect } from "bun:test";
import { createComponent } from "@tschk/moonshine-dom/component";
import { createRoot, batch } from "@tschk/moonshine-dom/reactive";
import { withRuneScheduler } from "../src/pre";
import { createConstDerived } from "../src/const-derived";
import { createState } from "../src/state";
import { onDestroy, tick } from "../src/svelte";
function setup(lifecycle = false) {
  const trace: unknown[][] = [];
  let state!: ReturnType<typeof createState<number>>,
    value!: { readonly value: number },
    stopBranch!: () => void;
  const stop = createRoot((dispose) => {
    createComponent(
      () =>
        withRuneScheduler(() => {
          state = createState(1);
          createRoot((disposeBranch) => {
            stopBranch = disposeBranch;
            value = createConstDerived(() => {
              const n = state.value;
              trace.push(["compute", n]);
              if (lifecycle)
                onDestroy(() => trace.push(["evaluation-destroy", n]));
              return n;
            });
            onDestroy(() => {
              try {
                trace.push(["cleanup-read", value.value]);
              } catch (error) {
                trace.push(["cleanup-error", (error as Error).message]);
              }
            });
          });
        }),
      {},
      "dom",
    );
    return dispose;
  });
  return {
    trace,
    state,
    get value() {
      return value.value;
    },
    stopBranch,
    stop,
  };
}
test("initialized historical query recomputes the old value without replacing evaluation ownership", () => {
  const a = setup();
  expect(a.value).toBe(1);
  a.state.value = 2;
  a.stopBranch();
  a.stop();
  expect(a.trace).toEqual([
    ["compute", 1],
    ["compute", 1],
    ["cleanup-read", 1],
  ]);
});
test("never read historical query first evaluates the old value without orphan work", () => {
  const a = setup();
  a.state.value = 2;
  a.stopBranch();
  a.stop();
  expect(a.trace).toEqual([
    ["compute", 1],
    ["cleanup-read", 1],
  ]);
});
test("later historical query uses the last flush snapshot and batches keep the first prior value", async () => {
  const a = setup();
  expect(a.value).toBe(1);
  a.state.value = 2;
  expect(a.value).toBe(2);
  await tick();
  a.state.value = 3;
  a.stopBranch();
  a.stop();
  expect(a.trace).toEqual([
    ["compute", 1],
    ["compute", 2],
    ["compute", 2],
    ["cleanup-read", 2],
  ]);
  const b = setup();
  expect(b.value).toBe(1);
  batch(() => {
    b.state.value = 2;
    b.state.value = 3;
  });
  b.stopBranch();
  b.stop();
  expect(b.trace).toEqual([
    ["compute", 1],
    ["compute", 1],
    ["cleanup-read", 1],
  ]);
});
test("historical lifecycle attempts fail and never create another surviving evaluation root", () => {
  const a = setup(true);
  expect(a.value).toBe(1);
  a.state.value = 2;
  a.stopBranch();
  a.stop();
  expect(a.trace.slice(0, 3)).toEqual([
    ["compute", 1],
    ["evaluation-destroy", 1],
    ["compute", 1],
  ]);
  expect(a.trace).toHaveLength(4);
  expect(a.trace[3]?.[0]).toBe("cleanup-error");
  expect(a.trace[3]?.[1]).toContain("effect_in_teardown");
});
