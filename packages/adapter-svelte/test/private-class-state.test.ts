import { expect, test } from "bun:test";
import { createPrivateState, createPrivateRawState } from "../src/runes";
import { createComputed, createRoot } from "@tschk/moonshine-dom/reactive";
import {
  holdHistory,
  releaseHistory,
  withHistoryCleanup,
} from "../src/history";

test("private deep assignment returns its resolved proxy before feedback writes", () => {
  createRoot((stop) => {
    const cell = createPrivateState({ count: 1 });
    createComputed(() => {
      if (cell.value.count === 2) cell.assign({ count: 3 });
    });
    const input = { count: 2 };
    const result = cell.assign(input);
    expect(result).not.toBe(input);
    expect(result.count).toBe(2);
    expect(cell.peek().count).toBe(3);
    stop();
  });
});

test("assignment result survives owner disposal during notification", () => {
  createRoot((stop) => {
    const cell = createPrivateState({ count: 1 });
    createComputed(() => {
      if (cell.value.count === 2) stop();
    });
    const result = cell.assign({ count: 2 });
    expect(result.count).toBe(2);
    expect(cell.peek()).toBe(result);
  });
});

test("peek is live and untracked while value retains cleanup history", () => {
  createRoot((stop) => {
    const deep = createPrivateState({ count: 1 });
    const raw = createPrivateRawState(1);
    let runs = 0;
    createComputed(() => {
      deep.peek();
      raw.peek();
      runs++;
    });
    holdHistory();
    try {
      deep.assign({ count: 2 });
      raw.value = 2;
      withHistoryCleanup(() => {
        expect([deep.value.count, raw.value]).toEqual([1, 1]);
        expect([deep.peek().count, raw.peek()]).toEqual([2, 2]);
      });
      expect(runs).toBe(1);
    } finally {
      releaseHistory();
      stop();
    }
  });
});

test("deep cells reuse existing graph identity and preserve literal functions", () => {
  const input = { nested: { count: 1 } };
  const cell = createPrivateState(input);
  const first = cell.peek();
  expect(first).not.toBe(input);
  expect(first.nested).not.toBe(input.nested);
  const next = cell.assign(input);
  expect(next).not.toBe(first);
  expect(cell.assign(next)).toBe(next);
  next.nested.count = 2;
  expect(input.nested.count).toBe(1);
  let calls = 0;
  const fn = () => ++calls;
  const deep = createPrivateState(fn),
    raw = createPrivateRawState(fn);
  expect(deep.assign(fn)).toBe(fn);
  raw.value = fn;
  expect(raw.peek()).toBe(fn);
  expect(calls).toBe(0);
});
