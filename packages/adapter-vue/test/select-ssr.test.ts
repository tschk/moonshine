import { expect, test } from "bun:test";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import { createServerModelOption } from "../src/select-ssr";

test("source select SSR matches calibrated option selection and serialization", () => {
  const cases: [unknown, Record<string, unknown>[], string[], boolean[]][] = [
    ["b", [{ value: "a" }, { value: "b" }], ["a", "b"], [false, true]],
    [
      undefined,
      [{ value: "a" }, { value: "b", selected: true }],
      ["a", "b"],
      [false, true],
    ],
    [null, [{ value: "a" }, { value: "b" }], ["a", "b"], [false, false]],
    [
      { id: 1 },
      [{ value: { id: 2 } }, { value: { id: "1" } }],
      ["a", "b"],
      [false, true],
    ],
    [[1], [{ value: "1" }, { value: "2" }], ["a", "b"], [true, false]],
    [
      new Set([1]),
      [{ value: "1" }, { value: "2" }],
      ["a", "b"],
      [false, false],
    ],
    ["alpha", [{}, {}], ["alpha", "beta"], [false, false]],
    [null, [{}, {}], ["alpha", "beta"], [true, true]],
    [
      null,
      [{ value: "a", selected: true }, { value: "b" }],
      ["a", "b"],
      [true, false],
    ],
    [["a"], [{ value: "a" }, { value: "b" }], ["a", "b"], [true, false]],
    ["a", [{ value: "a" }, { value: "a" }], ["first", "second"], [true, true]],
  ];
  for (const [model, props, labels, selected] of cases) {
    const html = renderToString(() =>
      h(
        "select",
        {},
        props.map((prop, index) =>
          createServerModelOption(prop, labels[index], () => model),
        ),
      ),
    );
    const options = [...html.matchAll(/<option([^>]*)>(.*?)<\/option>/g)];
    expect(options.map((option) => option[1]!.includes("selected"))).toEqual(
      selected,
    );
    expect(options.map((option) => option[2])).toEqual(labels);
    if (typeof model === "object" && model !== null && "id" in model)
      expect(html.includes("value=")).toBe(false);
  }
});
