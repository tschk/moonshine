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
  test("returns empty string for empty string input", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("returns regular strings unmodified", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
    expect(escapeHtml("1234567890")).toBe("1234567890");
  });

  test("escapes ampersands", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("&&&")).toBe("&amp;&amp;&amp;");
  });

  test("escapes less-than signs", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("1 < 2")).toBe("1 &lt; 2");
    expect(escapeHtml("<<<")).toBe("&lt;&lt;&lt;");
  });

  test("escapes greater-than signs", () => {
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml("2 > 1")).toBe("2 &gt; 1");
    expect(escapeHtml(">>>")).toBe("&gt;&gt;&gt;");
  });

  test("escapes double quotes", () => {
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml('hello "world"')).toBe("hello &quot;world&quot;");
    expect(escapeHtml('"""')).toBe("&quot;&quot;&quot;");
  });

  test("escapes single quotes", () => {
    expect(escapeHtml("'")).toBe("&#x27;");
    expect(escapeHtml("hello 'world'")).toBe("hello &#x27;world&#x27;");
    expect(escapeHtml("'''")).toBe("&#x27;&#x27;&#x27;");
  });

  test("escapes mixed occurrences", () => {
    expect(escapeHtml('<script>alert("xss & fun")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss &amp; fun&quot;)&lt;/script&gt;",
    );
  });

  test("handles multi-byte and emoji characters properly without mutating them", () => {
    expect(escapeHtml("👨‍👩‍👧‍👦 < 🐶")).toBe("👨‍👩‍👧‍👦 &lt; 🐶");
    expect(escapeHtml("こんにちは & さようなら")).toBe(
      "こんにちは &amp; さようなら",
    );
  });
});
