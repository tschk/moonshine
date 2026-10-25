import { describe, expect, test } from "bun:test";
import { serializeIslandProps, escapeHtml } from "../src/serialize";

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
  test("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("returns unmodified string when no special characters are present", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });

  test("escapes all HTML special characters", () => {
    expect(escapeHtml("&<>'\"")).toBe("&amp;&lt;&gt;&#x27;&quot;");
  });

  test("escapes multiple instances of the same character", () => {
    expect(escapeHtml("<<<>>>")).toBe("&lt;&lt;&lt;&gt;&gt;&gt;");
    expect(escapeHtml("&&&")).toBe("&amp;&amp;&amp;");
  });

  test("escapes mixed strings containing text and special characters", () => {
    expect(escapeHtml("<script>alert(\"hacked & owned 'you'\")</script>")).toBe(
      "&lt;script&gt;alert(&quot;hacked &amp; owned &#x27;you&#x27;&quot;)&lt;/script&gt;",
    );
  });

  test("double-escapes already escaped characters", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
});
