import { expect, test, describe } from "bun:test";
import { wrapFragmentSource } from "../src/index.js";

describe("wrapFragmentSource", () => {
  test("returns original source if it starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("returns original source if it includes void main", () => {
    const source = "precision highp float;\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("wraps with WebGL2 template when webgl2 is true", () => {
    const source =
      "vec4 shade(vec2 uv, float t) { return vec4(uv, 0.0, 1.0); }";
    const result = wrapFragmentSource(source, true);
    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain("outColor = shade(uv, u_time);");
    expect(result).toContain(source);
  });

  test("wraps with WebGL1 template when webgl2 is false", () => {
    const source =
      "vec4 shade(vec2 uv, float t) { return vec4(uv, 0.0, 1.0); }";
    const result = wrapFragmentSource(source, false);
    expect(result).not.toContain("#version 300 es");
    expect(result).not.toContain("out vec4 outColor;");
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
    expect(result).toContain(source);
  });

  test("handles extra whitespace appropriately", () => {
    const source = "  \n  #version 300 es\nvoid main() {}  \n";
    expect(wrapFragmentSource(source, true)).toBe(source);
  });
});
