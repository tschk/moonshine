import { expect, test } from "bun:test";
import { equalModelValue } from "../src/model-equality";

test("native form equality compares ordinary values without changing Set identity", () => {
  for (const [left, right] of [
    [1, "1"],
    [null, "null"],
    [undefined, "undefined"],
    [NaN, NaN],
    [
      [1, { id: 2 }],
      ["1", { id: "2" }],
    ],
    [new Date(12), new Date(12)],
  ] as const)
    expect(equalModelValue(left, right)).toBe(true);
  for (const [left, right] of [
    [null, undefined],
    [[], {}],
    [{ x: undefined }, { y: undefined }],
    [new Date(12), "12"],
    [Symbol("x"), Symbol("x")],
    [{ id: 1 }, "[object Object]"],
  ])
    expect(equalModelValue(left, right)).toBe(false);
  expect(equalModelValue(Array(1), ["present"])).toBe(false);
  expect(equalModelValue(Array(1), [undefined])).toBe(true);
  const value = { id: 1 };
  expect(equalModelValue(value, { id: "1" })).toBe(true);
  expect(new Set([value]).has({ id: 1 })).toBe(false);
});

test("server checked models preserve calibrated root-source scalar, collection and radio rules", async () => {
  const { createServerCheckedModel } = await import("../src/model-ssr");
  const { renderToString } = await import("@tschk/moonshine-dom/ssr");
  for (const [type, props, model, checked] of [
    ["checkbox", { checked: true }, undefined, true],
    ["checkbox", { checked: true }, null, true],
    ["radio", {}, undefined, true],
    ["checkbox", { "true-value": "yes", "false-value": "no" }, "no", true],
    ["checkbox", { value: "1" }, [1], true],
    ["checkbox", { value: "1" }, new Set([1]), true],
    ["radio", { value: { id: 1 } }, { id: "1" }, true],
  ] as const) {
    const html = renderToString(() =>
      createServerCheckedModel(type, props, () => model),
    );
    expect(/ checked(?:[ >]|=)/.test(html)).toBe(checked);
  }
});

test("nested source SSR uses true-value and omits model option attributes", async () => {
  const { createServerCheckedModel } = await import("../src/model-ssr");
  const { renderToString } = await import("@tschk/moonshine-dom/ssr");
  for (const value of ["no", "yes"]) {
    const html = renderToString(() =>
      createServerCheckedModel(
        "checkbox",
        { "true-value": "yes", "false-value": "no" },
        () => value,
        true,
      ),
    );
    expect(html.includes("checked")).toBe(value === "yes");
    expect(html.includes("true-value")).toBe(false);
    expect(html.includes("false-value")).toBe(false);
  }
});

test("source SSR preserves explicit checked for unmatched arrays and empty scalar values", async () => {
  const { createServerCheckedModel } = await import("../src/model-ssr");
  const { renderToString } = await import("@tschk/moonshine-dom/ssr");
  for (const nested of [false, true]) {
    for (const model of [undefined, null, false, []]) {
      const html = renderToString(() =>
        createServerCheckedModel(
          "checkbox",
          { checked: true, value: "x" },
          () => model,
          nested,
        ),
      );
      expect(html.includes("checked")).toBe(true);
    }
    expect(
      renderToString(() =>
        createServerCheckedModel("checkbox", {}, () => "", nested),
      ).includes("checked"),
    ).toBe(true);
  }
});
