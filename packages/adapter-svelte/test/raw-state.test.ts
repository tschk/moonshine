import { expect, test } from "bun:test";
import { createRawState } from "../src/raw-state";
import { createRuneEffect } from "../src/effect";
import { createRoot, createComputed } from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as ssrH, renderToString } from "@tschk/moonshine-dom/ssr";
import "../../react/test/dom";

test("raw cells preserve object/function identity and only replacements notify", () => {
  const original = { nested: { count: 1 } };
  const cell = createRawState(original);
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    createComputed(() => seen.push(cell.value.nested.count));
    return dispose;
  });
  expect(cell.value).toBe(original);
  cell.value.nested.count = 2;
  cell.value = original;
  expect(seen).toEqual([1]);
  const replacement = { nested: { count: 3 } };
  cell.value = replacement;
  expect(cell.value).toBe(replacement);
  expect(seen).toEqual([1, 3]);
  stop();
  const fn = () => 42;
  const callback = createRawState(fn);
  expect(callback.value).toBe(fn);
  const next = () => 43;
  callback.value = next;
  expect(callback.value).toBe(next);
  expect(callback.value()).toBe(43);
});

test("raw cleanup history keeps first replacement while cleanup writes update live DOM", async () => {
  const cell = createRawState({ count: 1 });
  const trace: number[][] = [];
  let writeInCleanup = true;
  const container = document.createElement("div");
  document.body.append(container);
  const stopDOM = render(
    () => h("output", null, () => cell.value.count),
    container,
  );
  const stop = createRoot((dispose) => {
    createRuneEffect(() => {
      const current = cell.value.count;
      trace.push([current]);
      return () => {
        const previous = cell.value.count;
        if (writeInCleanup) {
          writeInCleanup = false;
          cell.value = { count: 7 };
          trace.push([
            previous,
            cell.value.count,
            Number(container.textContent),
          ]);
        }
      };
    });
    return dispose;
  });
  await Promise.resolve();
  cell.value = { count: 2 };
  cell.value = { count: 3 };
  await Promise.resolve();
  expect(trace.slice(0, 3)).toEqual([[1], [1, 7, 7], [7]]);
  stop();
  stopDOM();
  container.remove();
});

test("raw SSR instances remain live, independent and readable after owner disposal", () => {
  const cells: ReturnType<typeof createRawState<number>>[] = [];
  const Component = ({ initial }: { initial: number }) => {
    const cell = createRawState(initial);
    cells.push(cell);
    cell.value++;
    return ssrH("p", null, cell.value);
  };
  expect(renderToString(() => ssrH(Component, { initial: 1 }))).toBe(
    "<p>2</p>",
  );
  expect(renderToString(() => ssrH(Component, { initial: 4 }))).toBe(
    "<p>5</p>",
  );
  expect(cells.map((cell) => cell.value)).toEqual([2, 5]);
  cells[0]!.value = 9;
  expect(cells.map((cell) => cell.value)).toEqual([9, 5]);
});

test("raw replacement equality and teardown history match pinned Svelte", async () => {
  function exercise(api: {
    cell: (initial: number) => { value: number };
    observe: (fn: () => void) => void;
    root: (fn: () => void) => () => void;
  }) {
    const seen: string[] = [];
    const stop = api.root(() => {
      const value = api.cell(0);
      api.observe(() =>
        seen.push(Object.is(value.value, -0) ? "-0" : String(value.value)),
      );
      value.value = -0;
      value.value = NaN;
      value.value = NaN;
      value.value = 1;
      value.value = 1;
    });
    stop();
    return seen;
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
      `import{state,get,set,render_effect,effect_root,flush as flushSync}from${JSON.stringify(client)};console.log(JSON.stringify((${exercise.toString()})({cell(initial){const s=state(initial);return{get value(){return get(s)},set value(v){set(s,v);flushSync()}}},observe:render_effect,root:effect_root})));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, error).toBe(0);
  expect(error).toBe("");
  expect(
    exercise({
      cell: createRawState,
      observe: createComputed,
      root: (fn) =>
        createRoot((stop) => {
          fn();
          return stop;
        }),
    }),
  ).toEqual(JSON.parse(output));

  const previous: number[] = [];
  const source = createRawState(NaN);
  const stop = createRoot((dispose) => {
    createRuneEffect(() => {
      void source.value;
      return () => {
        previous.push(source.value);
      };
    });
    return dispose;
  });
  await Promise.resolve();
  source.value = NaN;
  await Promise.resolve();
  expect(previous).toHaveLength(1);
  expect(Number.isNaN(previous[0])).toBe(true);
  stop();
});
