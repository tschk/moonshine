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
  test("returns empty string when given empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("returns the same string if no special characters are present", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  test("escapes ampersand (&)", () => {
    expect(escapeHtml("salt & pepper")).toBe("salt &amp; pepper");
  });

  test("escapes less than (<)", () => {
    expect(escapeHtml("1 < 2")).toBe("1 &lt; 2");
  });

  test("escapes greater than (>)", () => {
    expect(escapeHtml("2 > 1")).toBe("2 &gt; 1");
  });

  test('escapes double quote (")', () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  test("escapes single quote (')", () => {
    expect(escapeHtml("it's mine")).toBe("it&#x27;s mine");
  });

  test("escapes all special characters in a mixed string", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#x27;");
  });

  test("handles multibyte/emoji characters without corruption", () => {
    expect(escapeHtml("hello 👋 <world>")).toBe("hello 👋 &lt;world&gt;");
  });
});
