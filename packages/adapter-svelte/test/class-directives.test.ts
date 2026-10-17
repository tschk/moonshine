import { describe, expect, test } from "bun:test";
import { classDirectives, classValue } from "../src/class";

type Directives = Readonly<Record<string, unknown>>;

function check(
  value: unknown,
  hash: string | null | undefined,
  directives: Directives,
  expected: string | undefined,
): void {
  expect(classDirectives(value, hash, directives)).toBe(expected);
}

describe("classDirectives base via classValue", () => {
  test("falsy and empty bases", () => {
    check(false, null, {}, "false");
    check(0, null, {}, "0");
    check(null, null, {}, undefined);
    check(undefined, undefined, {}, undefined);
    check("", "", {}, undefined);
  });

  test("string base is preserved verbatim", () => {
    check("a  b\tc", null, {}, "a  b\tc");
  });

  test("object and array bases", () => {
    check(["a", { b: true, c: false }, [0, "d"]], null, { e: 1 }, "a b d e");
    check({ a: 1, b: 0 }, "h", { c: true }, "a h c");
  });

  test("inherited enumerable base flags are included", () => {
    const base = Object.create({ inherited: true }) as Record<string, unknown>;
    base.own = true;
    expect(classValue(base)).toBe("own inherited");
    check(base, null, { x: true }, "own inherited x");
    check(base, null, { inherited: false }, "own ");
  });
});

describe("classDirectives hash and ordering", () => {
  test("hash is appended before directives", () => {
    check("a", "h", { b: true }, "a h b");
    check(null, "h", { b: true }, "h b");
    check(null, null, { b: true }, "b");
  });

  test("falsy directive removes the hash", () => {
    check("a", "h", { h: false }, "a ");
    check(null, "h", { h: false }, undefined);
  });

  test("directives apply in own key order", () => {
    check("a", null, { b: true, a: false, c: true }, "b c");
    check("a", null, { a: false, b: true, c: true }, "b c");
    check("", null, { b: true, b2: true }, "b b2");
  });
});

describe("classDirectives duplicates and removal", () => {
  test("truthy appends even when base already has the token", () => {
    check("a b", null, { a: true }, "a b a");
  });

  test("falsy removes every exact token occurrence", () => {
    check("a b a c a", null, { a: false }, "b c ");
    check("a a a", null, { a: false }, undefined);
    check("x a", null, { a: false }, "x ");
  });

  test("falsy removes only exact whitespace-delimited tokens", () => {
    check("ab a abc ba", null, { a: false }, "ab abc ba");
    check("a-b a", null, { a: false }, "a-b ");
    check("b", null, { b: false }, undefined);
  });

  test("falsy override is last-writer within directive order", () => {
    check("a", null, { a: true, b: true }, "a a b");
    check("a", null, { a: false, b: true }, "b");
    check(null, null, { a: true, b: false }, "a");
  });

  test("whitespace behavior mirrors the source: one delimiter consumed", () => {
    check("a  b", null, { a: false }, " b");
    check("a\tb\nc", null, { b: false }, "a\tc");
    check("a b\u00a0c", null, { b: false }, "a c");
    check("a b\ufeffc", null, { b: false }, "a c");
    check(" a b ", null, { a: false }, " b ");
    check("a b", null, { b: false }, "a ");
  });

  test("non-boolean truthiness", () => {
    check("a", null, { b: "yes", c: "", d: 0, e: {}, a: null }, "b e");
  });
});

describe("classDirectives dangerous and invalid names", () => {
  test("__proto__ and constructor own keys do not mutate prototypes", () => {
    const own = JSON.parse(
      '{"__proto__": true, "constructor": true}',
    ) as Directives;
    expect(Object.keys(own)).toEqual(["__proto__", "constructor"]);
    check("a", null, own, "a __proto__ constructor");
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.getPrototypeOf(own)).toBe(Object.prototype);

    const off = JSON.parse(
      '{"__proto__": false, "constructor": false}',
    ) as Directives;
    check("__proto__ keep constructor", null, off, "keep ");
  });

  test("inherited and non-enumerable directive keys are ignored", () => {
    const directives = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    directives.own = true;
    Object.defineProperty(directives, "hidden", {
      value: true,
      enumerable: false,
    });
    check("a", null, directives, "a own");
  });

  test("symbols keys are ignored", () => {
    check("a", null, { [Symbol("s")]: true }, "a");
  });

  test("empty and whitespace names fail explicitly", () => {
    expect(() => classDirectives("a", null, { "": false })).toThrow(TypeError);
    expect(() => classDirectives("a", null, { "": true })).toThrow(TypeError);
    expect(() => classDirectives("a", null, { " ": false })).toThrow(TypeError);
    expect(() => classDirectives("a", null, { " \t\n": true })).toThrow(
      TypeError,
    );
    expect(() => classDirectives("a", null, { "\u00a0": false })).toThrow(
      TypeError,
    );
    expect(() =>
      classDirectives("a", null, { ok: true, "\ufeff": false }),
    ).toThrow(TypeError);
  });
});
