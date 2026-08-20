import { describe, expect, test } from "bun:test";
import { serializeData } from "../src/serialize";

// The single HTML-safe JSON serializer: the server data payload and the island
// props script are the same XSS-prevention primitive, so they share this one
// implementation rather than drifting apart in two packages.
describe("serializeData", () => {
  test("escapes <, >, &, U+2028, and U+2029", () => {
    const out = serializeData({
      html: "<script>alert('&  ')</script>",
    });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u0026");
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  test("omits undefined properties instead of nulling them", () => {
    expect(serializeData({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(serializeData([1, undefined])).toBe("[1,null]");
  });

  test("rejects symbol-keyed properties rather than dropping them", () => {
    expect(() => serializeData({ [Symbol("k")]: 1 })).toThrow(/symbol/);
  });

  test("serializes NaN and Infinity as null", () => {
    expect(serializeData({ a: NaN, b: Infinity, c: -Infinity })).toBe(
      '{"a":null,"b":null,"c":null}',
    );
  });

  test("allows shared references and rejects only true cycles", () => {
    const shared = { id: 1 };
    expect(serializeData({ a: shared, b: shared })).toBe(
      '{"a":{"id":1},"b":{"id":1}}',
    );
    expect(serializeData([shared, shared])).toBe('[{"id":1},{"id":1}]');

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => serializeData(cyclic)).toThrow(/cyclic/);

    const arr: unknown[] = [];
    arr.push(arr);
    expect(() => serializeData(arr)).toThrow(/cyclic/);
  });

  test("rejects functions, symbols, and bigints", () => {
    expect(() => serializeData({ f: () => 1 })).toThrow(/function/);
    expect(() => serializeData({ s: Symbol("x") })).toThrow(/symbol/);
    expect(() => serializeData({ n: 1n })).toThrow(/bigint/);
  });

  test("omits properties with throwing getters", () => {
    const obj = {
      get thrower() {
        throw new Error("Getter threw!");
      },
    };
    expect(serializeData(obj)).toBe("{}");
  });
});
