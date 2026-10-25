import { describe, it, expect } from "bun:test";
import { wrapFragmentSource } from "../src/index.js";

describe("wrapFragmentSource", () => {
  it("does not wrap if source starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("does not wrap if source includes void main", () => {
    const source = "precision highp float;\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("wraps source with WebGL2 boilerplate when webgl2 is true", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(uv, t, 1.0); }";
    const result = wrapFragmentSource(source, true);

    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  it("wraps source with WebGL1 boilerplate when webgl2 is false", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(uv, t, 1.0); }";
    const result = wrapFragmentSource(source, false);

    expect(result).not.toContain("#version 300 es");
    expect(result).not.toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
  });
});
