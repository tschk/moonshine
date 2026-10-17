import { expect, test } from "bun:test";
import { For, Index, h, renderToString } from "../src/ssr";
import { For as referenceFor, Index as referenceIndex } from "solid-js";

for (const [name, native, reference] of [
  ["For", For, referenceFor],
  ["Index", Index, referenceIndex],
] as const) {
  test(`${name} snapshots list length, reads rows live and defers fallback`, () => {
    function run(map: Function) {
      const trace: unknown[] = [];
      const items = ["first", "second"];
      const result = map({
        get each() {
          trace.push("each");
          return items;
        },
        get children() {
          trace.push("children");
          return (
            value: string | (() => string),
            index: number | (() => number),
          ) => {
            const read = () => (typeof value === "function" ? value() : value);
            trace.push([read(), typeof index === "function" ? index() : index]);
            if (trace.length === 3) {
              items[0] = "changed";
              items[1] = "live";
              items.push("excluded");
            }
            return read();
          };
        },
        get fallback() {
          throw Error("inactive fallback");
        },
      });
      return { result, trace };
    }
    expect(run(native)).toEqual(run(reference));
  });

  test(`${name} empty and disabled lists read children before fallback`, () => {
    for (const each of [[], false, null, undefined] as const) {
      function run(map: Function) {
        const trace: string[] = [];
        const result = map({
          get each() {
            trace.push("each");
            return each;
          },
          get children() {
            trace.push("children");
            return () => {
              throw Error("inactive row");
            };
          },
          get fallback() {
            trace.push("fallback");
            return "empty";
          },
        });
        return { result, trace };
      }
      expect(run(native)).toEqual(run(reference));
      expect(run(native)).toEqual({
        result: "empty",
        trace: ["each", "children", "fallback"],
      });
    }
  });
}

test("server list rows escape independently on fresh requests", () => {
  for (const offset of [0, 10]) {
    expect(
      renderToString(() =>
        h(
          "main",
          null,
          For({
            each: ["<&", "second"],
            children: (value, index) =>
              h("p", null, `${value}:${index() + offset}`),
          }),
          Index({
            each: ["<&", "second"],
            children: (value, index) =>
              h("i", null, `${value()}:${index + offset}`),
          }),
        ),
      ),
    ).toBe(
      `<main><p>&lt;&amp;:${offset}</p><p>second:${offset + 1}</p><i>&lt;&amp;:${offset}</i><i>second:${offset + 1}</i></main>`,
    );
  }
});

test("server list callbacks retain request context and drain cleanup on failure", async () => {
  const { getOwner, onCleanup } = await import("@tschk/moonshine-dom/reactive");
  const previousOwner = getOwner();
  const marker = Symbol("request");
  const trace: string[] = [];
  const failure = Error("row");
  for (const fail of [false, true]) {
    const run = () =>
      renderToString(() => {
        getOwner()!.context = new Map([[marker, fail]]);
        return h(For, {
          each: [1, 2],
          children: (item: number) => {
            expect(getOwner()!.context?.get(marker)).toBe(fail);
            onCleanup(() => trace.push(`${fail}:${item}`));
            if (fail && item === 2) throw failure;
            return h("p", null, item);
          },
        });
      });
    if (fail) expect(run).toThrow(failure);
    else expect(run()).toBe("<p>1</p><p>2</p>");
    expect(getOwner()).toBe(previousOwner);
  }
  expect(trace).toEqual(["false:1", "false:2", "true:1", "true:2"]);
});
