import { expect, test } from "bun:test";
import { reactive } from "../src/reactive";
import {
  normalizeClass,
  normalizeStyle,
  normalizeStaticStyle,
  normalizeClassSSR,
  normalizeStyleDOM,
  normalizeStyleSSR,
} from "../src/normalize";
test("class normalization keeps internal spaces and traverses nested arrays and inherited keys", () => {
  expect(normalizeClass(" a  b ")).toBe("a  b");
  expect(normalizeClass(["a", { b: true, no: false }, ["c", null]])).toBe(
    "a b c",
  );
  expect(
    normalizeClass(
      Object.assign(Object.create({ inherited: true }), { own: 1, no: 0 }),
    ),
  ).toBe("own inherited");
  expect(normalizeClass(false)).toBe("");
  expect(normalizeClassSSR(false)).toBe(false);
  expect(normalizeClassSSR(0)).toBe(0);
  expect(normalizeClassSSR(null)).toBeNull();
  expect(normalizeClassSSR(" a  b ")).toBe(" a  b ");
  expect(normalizeClassSSR(["a", { b: true }])).toBe("a b");
});
test("static style strings become records while dynamic strings and plain objects preserve identity", () => {
  const style = { color: "red" };
  expect(normalizeStyle(style)).toBe(style);
  expect(normalizeStyleDOM(style)).toBe(style);
  expect(normalizeStyleSSR(style)).toBe(style);
  expect(normalizeStyle("color:red")).toBe("color:red");
  expect(normalizeStaticStyle("color:red")).toEqual({ color: "red" });
  expect(
    normalizeStyle(["color:red;--x:a", { color: "blue" }, ["font-size:12px"]]),
  ).toEqual({ color: "blue", "--x": "a", "font-size": "12px" });
  expect(normalizeStyleDOM(false)).toBeUndefined();
  expect(normalizeStyleSSR(false)).toBe(false);
  expect(normalizeStyleSSR(0)).toBe(0);
  expect(normalizeStyleSSR(null)).toBeNull();
  let calls = 0;
  const fn = () => {
    calls++;
    return false;
  };
  expect(normalizeStyleSSR(fn)).toBe(fn);
  expect(normalizeStyleDOM(fn)).toBeUndefined();
  expect(calls).toBe(0);
});
test("declaration normalization follows narrow comment and parentheses recovery without CSSOM", () => {
  expect(
    normalizeStaticStyle("color:red;/*removed*/color:blue;--x:func(a;b)"),
  ).toEqual({ color: "blue", "--x": "func(a;b)" });
  expect(normalizeStyle(['content:"a;b";color:red'])).toEqual({
    content: '"a',
    color: "red",
  });
  expect(normalizeStyle(['content:"/*x*/";--x:a'])).toEqual({
    content: '""',
    "--x": "a",
  });
  expect(normalizeStyle(["url:https://x:y;empty:;broken"])).toEqual({
    url: "https://x:y",
  });
});
test("VNode policy snapshots reactive nonarrays without changing public helper identity", () => {
  const style = reactive({ color: "red" });
  expect(normalizeStyle(style)).toBe(style);
  const a = normalizeStyleDOM(style),
    b = normalizeStyleSSR(style);
  expect(a).not.toBe(style);
  expect(b).not.toBe(style);
  style.color = "blue";
  expect(a.color).toBe("red");
  expect(b.color).toBe("red");
  expect(normalizeStyleDOM(style).color).toBe("blue");
});
test("array merges include inherited keys and keep prototype names as own data", () => {
  const sparse: unknown[] = [];
  sparse[2] = Object.assign(Object.create({ color: "red" }), {
    constructor: "blue",
    toString: "green",
  });
  expect(normalizeStyle(sparse)).toEqual({
    constructor: "blue",
    toString: "green",
    color: "red",
  });
  const prototype = { inherited: true };
  const source = Object.create(null);
  source.__proto__ = prototype;
  const result = normalizeStyle([source]);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.hasOwn(result, "__proto__")).toBe(true);
  expect(result.__proto__).toBe(prototype);
  expect(Object.prototype).not.toHaveProperty("inherited");
  const cycle: unknown[] = [];
  cycle.push(cycle);
  expect(() => normalizeStyle(cycle)).toThrow(RangeError);
  expect(() => normalizeClass(cycle)).toThrow(RangeError);
});
