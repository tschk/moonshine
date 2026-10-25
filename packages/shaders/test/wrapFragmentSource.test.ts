import { describe, expect, test } from "bun:test";
import { wrapFragmentSource } from "../src/index";

describe("wrapFragmentSource", () => {
  test("returns source untouched if it starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("returns source untouched if it includes void main", () => {
    const source = "void main() { gl_FragColor = vec4(1.0); }";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("wraps source in WebGL2 boilerplate when webgl2 is true", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, true);
    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  test("wraps source in WebGL1 boilerplate when webgl2 is false", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, false);
    expect(result).not.toContain("#version 300 es");
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
    expect(result).toContain(source);
  });
});
