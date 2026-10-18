import { expect, test } from "bun:test";
import { renderToString, sourceComponent } from "../src/ssr";

test("spread snapshots preserve own special and symbol keys without inherited props", () => {
  const symbol = Symbol("prop");
  let reads = 0;
  const source = Object.assign(Object.create({ inherited: "ignored" }), {
    toString: "ordinary",
    [symbol]: "symbol",
  });
  Object.defineProperty(source, "__proto__", {
    enumerable: true,
    value: "own",
  });
  Object.defineProperty(source, "label", {
    enumerable: true,
    get() {
      reads++;
      return "<&";
    },
  });
  const spread = { ...source };
  const html = renderToString(() => {
    const child = sourceComponent((props) => {
      expect(Object.hasOwn(props, "inherited")).toBe(false);
      expect(Object.hasOwn(props, "__proto__")).toBe(true);
      expect(props["__proto__"]).toBe("own");
      expect(props.toString).toBe("ordinary");
      expect(props[symbol]).toBe("symbol");
      return props.label;
    }, spread);
    spread.label = "changed";
    return child;
  });
  expect(html).toBe("&lt;&amp;");
  expect(reads).toBe(1);
});

test("captured class directives normalize without mutating caller props", () => {
  for (const [props, expected, hasList] of [
    [
      {
        class: "explicit",
        "class:list": ["a", { on: true }],
      },
      "explicit a on",
      false,
    ],
    [{ class: "spread", "class:list": ["a"] }, "spread a", false],
    [{ class: "base", "class:list": ["last"] }, "base last", false],
    [{ class: "", "class:list": [] }, undefined, false],
    [{ class: "base", "class:list": undefined }, "base", true],
  ] as const) {
    const before = { ...props };
    renderToString(() =>
      sourceComponent((value) => {
        expect(value.class).toBe(expected);
        expect(Object.hasOwn(value, "class:list")).toBe(hasList);
        return "";
      }, props),
    );
    expect(props).toEqual(before);
  }
});
