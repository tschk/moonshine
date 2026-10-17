import { expect, test } from "bun:test";
import {
  createRoot,
  createComputed,
  getOwner,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import "../../react/test/dom";
import { createState } from "../src/state";
import { createRuneRoot, createRuneEffect } from "../src/effect";
import {
  collectHistoryReads,
  hasHistory,
  historicalValue,
  holdHistory,
  releaseHistory,
  withHistoryCleanup,
  withHistoryMutation,
  recordHistory,
  readHistory,
} from "../src/history";

test("first previous values are global, including cleanup-only reads, and clear after a tick", async () => {
  const a = createState(0),
    b = createState(10);
  a.value = 1;
  a.value = 2;
  b.value = 11;
  b.value = 12;
  expect(withHistoryCleanup(() => [a.value, b.value])).toEqual([0, 10]);
  expect([a.value, b.value]).toEqual([2, 12]);
  await Promise.resolve();
  expect(withHistoryCleanup(() => [a.value, b.value])).toEqual([2, 12]);
});

test("holds protect pending cleanup, release clears synchronously and old timers cannot clear new epochs", async () => {
  const value = createState(0);
  holdHistory();
  value.value = 1;
  await Promise.resolve();
  expect(withHistoryCleanup(() => value.value)).toBe(0);
  releaseHistory();
  expect(withHistoryCleanup(() => value.value)).toBe(1);
  holdHistory();
  value.value = 2;
  await Promise.resolve();
  expect(withHistoryCleanup(() => value.value)).toBe(1);
  releaseHistory();
});

test("initialized property sources retain history while key enumeration stays live", () => {
  holdHistory();
  try {
    const raw = { item: { value: 1 }, list: [1, 2], removed: 3 };
    const value = createState(raw);
    void value.value.item.value;
    void value.value.removed;
    void value.value.list[1];
    value.value.item.value = 2;
    delete (value.value as Partial<typeof raw>).removed;
    (value.value as typeof raw & { added?: number }).added = 4;
    value.value.list.length = 1;
    withHistoryCleanup(() => {
      expect(value.value.item.value).toBe(1);
      expect("removed" in value.value).toBe(true);
      expect("added" in value.value).toBe(true);
      expect(Object.keys(value.value)).toEqual(["item", "list", "added"]);
      expect(
        Object.getOwnPropertyDescriptor(value.value, "removed")?.value,
      ).toBe(3);
      expect(value.value.list.length).toBe(2);
      expect(value.value.list[1]).toBe(2);
      expect(Object.keys(value.value.list)).toEqual(["0"]);
    });
    expect(raw).toEqual({ item: { value: 1 }, list: [1, 2], removed: 3 });
  } finally {
    releaseHistory();
  }
});

test("cleanup writes read new values while synchronous computations under another owner remain live", () => {
  const a = createState(0),
    b = createState(10);
  const seen: number[][] = [];
  const stop = createRoot((dispose) => {
    createComputed(() => {
      seen.push([a.value, b.value]);
    });
    return dispose;
  });
  holdHistory();
  try {
    b.value = 11;
    withHistoryCleanup(() => {
      expect(b.value).toBe(10);
      a.value = 1;
      expect(a.value).toBe(1);
      expect(b.value).toBe(10);
    });
    expect(seen.at(-1)).toEqual([1, 11]);
  } finally {
    releaseHistory();
    stop();
  }
});

test("history scopes follow owners, restore errors and collect transitive tokens", () => {
  const target = {},
    token = {};
  let live = 1;
  holdHistory();
  try {
    withHistoryMutation(() => {
      recordHistory(target, "x", 0, 1);
    });
    const read = () => readHistory(target, "x", () => live);
    const collected = collectHistoryReads(
      () => collectHistoryReads(read).value,
    );
    expect(hasHistory(collected.reads)).toBe(true);
    const stop = createRoot((dispose) => {
      const owner = getOwner();
      withHistoryCleanup(() => {
        expect(read()).toBe(0);
        expect(runWithOwner(null, read)).toBe(1);
        expect(runWithOwner(owner, read)).toBe(0);
        expect(historicalValue(token, read)).toBe(0);
        live = 2;
        recordHistory(target, "x", 1, 2);
        expect(read()).toBe(2);
        expect(historicalValue(token, read)).toBe(0);
      });
      return dispose;
    });
    stop();
    expect(() =>
      withHistoryCleanup(() => {
        throw Error("test");
      }),
    ).toThrow("test");
    expect(read()).toBe(2);
  } finally {
    releaseHistory();
  }
});

test("cleanup writes keep synchronous DOM render accessors on live values", () => {
  const a = createState(0),
    b = createState(10);
  const container = document.createElement("div");
  const stop = render(
    () => h("p", null, () => `${a.value}:${b.value}`),
    container,
  );
  holdHistory();
  try {
    b.value = 11;
    withHistoryCleanup(() => {
      a.value = 1;
      expect(b.value).toBe(10);
    });
    expect(container.textContent).toBe("1:11");
  } finally {
    releaseHistory();
    stop();
  }
});

test("manual cleanup caches without mutations expire before the next microtask", async () => {
  const token = {};
  let value = 1;
  expect(withHistoryCleanup(() => historicalValue(token, () => value))).toBe(1);
  value = 2;
  await Promise.resolve();
  expect(withHistoryCleanup(() => historicalValue(token, () => value))).toBe(2);
});

test("deep teardown history and immediate manual stop match pinned Svelte", async () => {
  async function exercise(
    wrap: <T>(value: T) => T,
    root: (fn: () => void | (() => void)) => () => void,
    effect: (fn: () => void | (() => void)) => void,
  ) {
    const result = [];
    for (const [immediate, preread] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]) {
      const state = wrap({
        trigger: 0,
        nested: { count: 1, removed: 3 },
        list: [1, 2],
      });
      const trace: unknown[] = [];
      if (preread) {
        void state.nested.count;
        void state.nested.removed;
        void state.list[1];
      }
      function inspect() {
        const descriptor = Object.getOwnPropertyDescriptor(
          state.nested,
          "removed",
        );
        const added = Object.getOwnPropertyDescriptor(state.nested, "added");
        return {
          count: state.nested.count ?? null,
          countUndefined: state.nested.count === undefined,
          hasRemoved: "removed" in state.nested,
          keys: Object.keys(state.nested),
          descriptorExists: descriptor !== undefined,
          descriptorValue: descriptor?.value ?? null,
          addedExists: added !== undefined,
          addedUndefined: added !== undefined && added.value === undefined,
          length: state.list.length,
          second: state.list[1] ?? null,
          secondExists: 1 in state.list,
          arrayKeys: Object.keys(state.list),
        };
      }
      const stop = root(() => {
        effect(() => {
          trace.push(["run", state.trigger]);
          return () => {
            trace.push(["cleanup", inspect()]);
          };
        });
      });
      await Promise.resolve();
      await Promise.resolve();
      state.trigger = 1;
      state.nested.count = 2;
      delete (state.nested as Partial<typeof state.nested>).removed;
      (state.nested as typeof state.nested & { added?: number }).added =
        undefined;
      state.list.length = 1;
      if (immediate) stop();
      await Promise.resolve();
      await Promise.resolve();
      trace.push(["live", inspect()]);
      if (!immediate) stop();
      result.push({ immediate, preread, trace });
    }
    return result;
  }
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import{proxy,effect_root,user_effect}from${JSON.stringify(client)};console.log(JSON.stringify(await (${exercise.toString()})(proxy,effect_root,user_effect)));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  const native = await exercise(
    (value) => createState(value).value,
    createRuneRoot,
    createRuneEffect,
  );
  expect(native).toEqual(JSON.parse(output));
});

test("state signed-zero and NaN writes including cleanup match pinned Svelte", async () => {
  async function exercise(
    cell: (value: number, nested: boolean) => { value: number },
    root: (fn: () => void | (() => void)) => () => void,
    effect: (fn: () => void | (() => void)) => void,
  ) {
    const flags = (value: number) => ({
      negative: Object.is(value, -0),
      nan: Number.isNaN(value),
    });
    const output = [];
    for (const nested of [false, true])
      for (const kind of ["zero", "nan", "cleanupZero", "unreadZero"]) {
        const value = cell(kind === "nan" ? NaN : 0, nested),
          trigger = cell(0, false);
        const trace: unknown[] = [];
        let once = false;
        const stop = root(() => {
          effect(() => {
            const current = trigger.value;
            trace.push([
              "run",
              current,
              kind === "unreadZero" ? null : flags(value.value),
            ]);
            return () => {
              trace.push(["cleanup", flags(value.value)]);
              if (kind === "cleanupZero" && !once) {
                once = true;
                value.value = -0;
                trace.push(["write", flags(value.value)]);
              }
            };
          });
        });
        await Promise.resolve();
        await Promise.resolve();
        if (kind === "cleanupZero") trigger.value = 1;
        else value.value = kind === "nan" ? NaN : -0;
        const immediate = flags(value.value);
        await Promise.resolve();
        await Promise.resolve();
        stop();
        output.push({
          nested,
          kind,
          immediate,
          final: flags(value.value),
          trace,
        });
      }
    return output;
  }
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import{proxy,state,get,set,effect_root,user_effect}from${JSON.stringify(client)};const cell=(initial,nested)=>{if(nested){const value=proxy({value:initial});return value}const node=state(initial);return{get value(){return get(node)},set value(next){set(node,next)}}};console.log(JSON.stringify(await (${exercise.toString()})(cell,effect_root,user_effect)));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  expect(
    await exercise(
      (value, nested) =>
        nested ? createState({ value }).value : createState(value),
      createRuneRoot,
      createRuneEffect,
    ),
  ).toEqual(JSON.parse(output));
});
