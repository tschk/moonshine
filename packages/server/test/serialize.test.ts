import { describe, expect, test } from "bun:test";
import { serializeData } from "../src/serialize";

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
});
