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
  test("returns normal strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
    expect(escapeHtml("1234567890")).toBe("1234567890");
    expect(escapeHtml("abc DEF ghi")).toBe("abc DEF ghi");
  });

  test("handles empty strings", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("escapes individual special characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#x27;");
  });

  test("escapes multiple occurrences of special characters", () => {
    expect(escapeHtml("&&&")).toBe("&amp;&amp;&amp;");
    expect(escapeHtml("<<<")).toBe("&lt;&lt;&lt;");
    expect(escapeHtml(">>>")).toBe("&gt;&gt;&gt;");
    expect(escapeHtml('"""')).toBe("&quot;&quot;&quot;");
    expect(escapeHtml("'''")).toBe("&#x27;&#x27;&#x27;");
  });

  test("escapes combinations of special characters and XSS payloads", () => {
    expect(escapeHtml("<script>alert('XSS')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;XSS&#x27;)&lt;/script&gt;"
    );
    expect(escapeHtml('<a href="javascript:alert(1)">link</a>')).toBe(
      "&lt;a href=&quot;javascript:alert(1)&quot;&gt;link&lt;/a&gt;"
    );
    expect(escapeHtml("Ben & Jerry's <Ice Cream> \"Rocks\"")).toBe(
      "Ben &amp; Jerry&#x27;s &lt;Ice Cream&gt; &quot;Rocks&quot;"
    );
  });
});
