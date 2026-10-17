import { expect, test } from "bun:test";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import { createComponent } from "@tschk/moonshine-dom/component";
import { createServerDerived, createServerState } from "../src/ssr";

function literal() {
  throw Error("function value was invoked");
}

function model(initial: unknown) {
  const state = createServerState(initial);
  let calls = 0;
  const derived = createServerDerived(() => {
    calls++;
    if (state.value === "throw" && calls === 1) throw Error("retry");
    return state.value;
  });
  return {
    read: () => derived.value,
    assign: (value: unknown) => {
      derived.value = value;
    },
    write: (value: unknown) => {
      state.value = value;
    },
    calls: () => calls,
  };
}

// Exact traces checked against production Svelte 5.57.1 compileModule + SSR render.
function trace() {
  const value = model(1);
  const rows: unknown[][] = [[value.read(), value.read(), value.calls()]];
  value.write(2);
  rows.push([value.read(), value.calls()]);
  for (const next of [null, undefined, false, 0, NaN]) {
    value.assign(next);
    rows.push([next, value.read(), value.calls()]);
  }
  value.assign(literal);
  expect(value.read()).toBe(literal);
  rows.push(["function", value.calls()]);
  const retry = model("throw");
  expect(() => retry.read()).toThrow("retry");
  rows.push(["retry", retry.read(), retry.calls()]);
  return rows;
}

test("server companion derived values outside rendering recompute and use nullish override fallback", () => {
  expect(trace()).toEqual([
    [1, 1, 2],
    [2, 3],
    [null, 2, 4],
    [undefined, 2, 5],
    [false, false, 5],
    [0, 0, 5],
    [NaN, NaN, 5],
    ["function", 5],
    ["retry", "throw", 2],
  ]);
});

test("server derived values created during rendering cache until an explicit nonnullish override", () => {
  const rows: unknown[][][] = [];
  const Page = () => {
    rows.push(trace());
    return h("p", null, "<request>&");
  };
  expect(renderToString(() => h(Page, {}))).toBe("<p>&lt;request&gt;&amp;</p>");
  expect(renderToString(() => h(Page, {}))).toBe("<p>&lt;request&gt;&amp;</p>");
  const expected = [
    [1, 1, 1],
    [1, 1],
    [null, 1, 1],
    [undefined, 1, 1],
    [false, false, 1],
    [0, 0, 1],
    [NaN, NaN, 1],
    ["function", 1],
    ["retry", "throw", 2],
  ];
  expect(rows).toEqual([expected, expected]);
});

test("cache mode belongs to creation rather than the later read context", () => {
  let inside!: ReturnType<typeof model>;
  renderToString(() => {
    inside = model(3);
    return "";
  });
  expect(inside.read()).toBe(3);
  expect(inside.read()).toBe(3);
  expect(inside.calls()).toBe(1);
  const outside = model(4);
  renderToString(() => {
    expect(outside.read()).toBe(4);
    expect(outside.read()).toBe(4);
    return "";
  });
  expect(outside.calls()).toBe(2);
});

test("explicit component caching and SSR frames work without an active serializer", () => {
  let calls = 0;
  const explicit = createServerDerived(() => ++calls, true);
  expect(explicit.value).toBe(1);
  expect(explicit.value).toBe(1);
  const framed = createComponent(
    () => createServerDerived(() => ++calls),
    {},
    "ssr",
  );
  expect(framed.value).toBe(2);
  expect(framed.value).toBe(2);
  renderToString(() => {
    const uncached = createServerDerived(() => ++calls, false);
    expect(uncached.value).toBe(3);
    expect(uncached.value).toBe(4);
    return "";
  });
});

test("plain server cells preserve literal values and cached undefined is not a cache miss", () => {
  const cell = createServerState<unknown>(literal);
  expect(cell.value).toBe(literal);
  for (const value of [null, undefined, false, 0, NaN]) {
    cell.value = value;
    expect(cell.value).toBe(value);
  }
  let calls = 0;
  const cached = createServerDerived(() => {
    calls++;
    return undefined;
  }, true);
  expect(cached.value).toBeUndefined();
  expect(cached.value).toBeUndefined();
  expect(calls).toBe(1);
});
