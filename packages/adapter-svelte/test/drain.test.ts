import { test, expect } from "bun:test";
import {
  createRoot,
  createRenderEffect,
  createSignal,
} from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { createRuneEffect } from "@tschk/moonshine-svelte/runes";
import { createState } from "../src/state";
import { withRuneScheduler, flushRuneWork } from "../src/pre";
import { withHistoryCleanup } from "../src/history";
test("manual drain invalidates old queued flush without stealing a subsequent cycle", async () => {
  const [n, set] = createSignal(0);
  const trace: number[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => createRenderEffect(() => trace.push(n())));
  });
  await Promise.resolve();
  trace.length = 0;
  set(1);
  flushRuneWork();
  expect(trace).toEqual([1]);
  let between: number[] = [];
  queueMicrotask(() => {
    between = trace.slice();
  });
  set(2);
  await Promise.resolve();
  expect(between).toEqual([1]);
  expect(trace).toEqual([1, 2]);
  await Promise.resolve();
  expect(trace).toEqual([1, 2]);
  stop();
});
test("nested drain during callback never recursively flushes and peers continue", async () => {
  const [n, set] = createSignal(0),
    trace: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRenderEffect(() => {
        const v = n();
        trace.push("start" + v);
        flushRuneWork();
        trace.push("end" + v);
      });
      createRenderEffect(() => trace.push("peer" + n()));
    });
  });
  await Promise.resolve();
  trace.length = 0;
  set(1);
  flushRuneWork();
  expect(trace).toEqual(["start1", "end1", "peer1"]);
  await Promise.resolve();
  expect(trace.length).toBe(3);
  stop();
});
test("scheduler and component initialization defer drains until setup has completed", async () => {
  const trace: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRuneEffect(() => trace.push("post"));
      flushRuneWork();
      expect(trace).toEqual([]);
      createComponent(
        () => {
          flushRuneWork();
          expect(trace).toEqual([]);
          return undefined;
        },
        {},
        "dom",
      );
      trace.push("setup");
    });
  });
  expect(trace).toEqual(["setup"]);
  flushRuneWork();
  expect(trace).toEqual(["setup", "post"]);
  await Promise.resolve();
  expect(trace).toEqual(["setup", "post"]);
  stop();
});
test("history releases once after a drained cycle and old timer cannot clear new history", async () => {
  const state = createState(0);
  const trace: unknown[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      createRuneEffect(() => {
        const v = state.value;
        trace.push(["run", v]);
        return () => trace.push(["clean", state.value]);
      }),
    );
  });
  await Promise.resolve();
  trace.length = 0;
  state.value = 1;
  flushRuneWork();
  expect(trace).toEqual([
    ["clean", 0],
    ["run", 1],
  ]);
  state.value = 2;
  await Promise.resolve();
  expect(trace).toEqual([
    ["clean", 0],
    ["run", 1],
    ["clean", 1],
    ["run", 2],
  ]);
  withHistoryCleanup(() => expect(state.value).toBe(2));
  stop();
});
test("drain preserves first callback error, drains peers, and leaves old timer inert", async () => {
  const [n, set] = createSignal(0),
    trace: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      createRenderEffect(() => {
        if (n()) {
          trace.push("bad");
          throw Error("first");
        }
      });
      createRenderEffect(() => {
        if (n()) trace.push("peer");
      });
    });
  });
  await Promise.resolve();
  set(1);
  expect(flushRuneWork).toThrow("first");
  expect(trace).toEqual(["bad", "peer"]);
  await Promise.resolve();
  expect(trace).toEqual(["bad", "peer"]);
  stop();
});
