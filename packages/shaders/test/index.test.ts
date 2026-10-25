import { describe, expect, test } from "bun:test";
import { wrapFragmentSource } from "../src/index";

describe("wrapFragmentSource", () => {
  test("returns unmodified if starts with #version", () => {
    const source = "#version 300 es\nvoid foo() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("returns unmodified if includes void main", () => {
    const source = "void main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("wraps in WebGL2", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, true);
    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  test("wraps in WebGL1", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, false);
    expect(result).not.toContain("#version 300 es");
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
    expect(result).toContain(source);
  });
});
