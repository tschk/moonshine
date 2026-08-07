import { describe, expect, test } from "bun:test";
import { serializeData } from "../src";

describe("serializeData", () => {
  test("escapes <, >, &, U+2028, and U+2029", () => {
    const input = {
      html: "<script>alert('&\u2028\u2029')</script>",
    };
    const out = serializeData(input);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u0026");
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  test("rejects functions", () => {
    expect(() => serializeData(() => 1)).toThrow(/function/);
    expect(() => serializeData({ fn: () => 1 })).toThrow(/function/);
  });

  test("rejects symbols", () => {
    expect(() => serializeData(Symbol())).toThrow(/symbol/);
    expect(() => serializeData({ [Symbol()]: 1 })).toThrow(/symbol/);
  });

  test("rejects cyclic references", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => serializeData(a)).toThrow(/cyclic/);
  });
  test("omits undefined properties instead of nulling them", () => {
    // JSON semantics, and what the island serializer always did: emitting
    // "k":null turns an absent value into a present null across the wire.
    expect(serializeData({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(serializeData([1, undefined])).toBe("[1,null]");
  });
});
