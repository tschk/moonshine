import { describe, expect, test } from "bun:test";
import { escapeHtml, serializeIslandProps } from "../src/serialize";

describe("escapeHtml", () => {
  test("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("handles string with no special characters", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  test("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  test("escapes less than and greater than", () => {
    expect(escapeHtml("<a>")).toBe("&lt;a&gt;");
  });

  test("escapes double and single quotes", () => {
    expect(escapeHtml("\"hello'world\"")).toBe("&quot;hello&#x27;world&quot;");
  });

  test("escapes multiple occurrences", () => {
    expect(escapeHtml("<<&>>")).toBe("&lt;&lt;&amp;&gt;&gt;");
  });

  test("escapes complex combinations", () => {
    expect(escapeHtml("<script>alert('xss' & \"xss\")</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27; &amp; &quot;xss&quot;)&lt;/script&gt;",
    );
  });
});

describe("serializeIslandProps", () => {
  test("serializes shared, non-cyclic references", () => {
    const shared = { id: 1 };
    expect(serializeIslandProps({ a: shared, b: shared })).toBe(
      '{"a":{"id":1},"b":{"id":1}}',
    );
    const item = { n: 2 };
    expect(serializeIslandProps([item, item])).toBe('[{"n":2},{"n":2}]');
    expect(serializeIslandProps({ x: { deep: shared }, y: shared })).toBe(
      '{"x":{"deep":{"id":1}},"y":{"id":1}}',
    );
  });

  test("still rejects true cycles", () => {
    const self: Record<string, unknown> = {};
    self.self = self;
    expect(() => serializeIslandProps(self)).toThrow(TypeError);

    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { a };
    a.b = b;
    expect(() => serializeIslandProps(a)).toThrow(TypeError);

    const arr: unknown[] = [];
    arr.push(arr);
    expect(() => serializeIslandProps(arr)).toThrow(TypeError);
  });

  test("still rejects unserializable values", () => {
    expect(() => serializeIslandProps({ f: () => 1 })).toThrow(TypeError);
    expect(() => serializeIslandProps({ s: Symbol("x") })).toThrow(TypeError);
    expect(() => serializeIslandProps({ n: 1n })).toThrow(TypeError);
  });

  test("still escapes characters that could break out of a script tag", () => {
    const out = serializeIslandProps({ html: "</script><img>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<img>");
    expect(JSON.parse(out)).toEqual({ html: "</script><img>" });
  });
  test("rejects symbol-keyed properties rather than dropping them", () => {
    // JSON.stringify silently skips symbol keys; the server serializer always
    // threw. Dropping a prop server-side that the client expects is a
    // hydration mismatch, so both paths now refuse the value.
    expect(() => serializeIslandProps({ [Symbol("k")]: 1 })).toThrow(/symbol/);
  });
});
