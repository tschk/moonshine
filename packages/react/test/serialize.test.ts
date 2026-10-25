import { describe, expect, test } from "bun:test";
import { escapeHtml, serializeIslandProps } from "../src/serialize";

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

describe("escapeHtml", () => {
  test("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("handles string with no special characters", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  test("escapes ampersands", () => {
    expect(escapeHtml("a & b & c")).toBe("a &amp; b &amp; c");
  });

  test("escapes less-than and greater-than signs", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes double quotes", () => {
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  test("escapes single quotes", () => {
    expect(escapeHtml("'quoted'")).toBe("&#x27;quoted&#x27;");
  });

  test("escapes mixed special characters", () => {
    expect(escapeHtml(`<div class="foo" data-val='1 & 2'>`)).toBe(
      "&lt;div class=&quot;foo&quot; data-val=&#x27;1 &amp; 2&#x27;&gt;"
    );
  });
});
