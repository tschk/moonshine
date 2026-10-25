import { describe, it, expect } from "bun:test";
import { wrapFragmentSource } from "../src/index.ts";

describe("wrapFragmentSource", () => {
  it("returns the source if it starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns the source if it includes void main", () => {
    const source = "precision highp float;\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns the source if it starts with #version (with leading whitespace)", () => {
    const source = "  \n  #version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
  });

  it("wraps source for WebGL 1 if webgl2 is false", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, false);
    expect(result).not.toContain("#version 300 es");
    expect(result).toContain("precision highp float;");
    expect(result).toContain("uniform vec2 u_resolution;");
    expect(result).toContain("uniform float u_time;");
    expect(result).toContain(source);
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
  });

  it("wraps source for WebGL 2 if webgl2 is true", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, true);
    expect(result).toContain("#version 300 es");
    expect(result).toContain("precision highp float;");
    expect(result).toContain("uniform vec2 u_resolution;");
    expect(result).toContain("uniform float u_time;");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });
});
