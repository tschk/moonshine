import { describe, it, expect } from "bun:test";
import { wrapFragmentSource } from "../src/index.js";

describe("wrapFragmentSource", () => {
  it("should return the source unmodified if it starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("should return the source unmodified if it contains void main", () => {
    const source = "precision highp float;\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("should return the source unmodified even if there is leading whitespace before #version", () => {
    const source = "  \n\t#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
  });

  it("should wrap the source with WebGL2 boilerplate if webgl2 is true and it lacks #version and void main", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, true);
    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  it("should wrap the source with WebGL1 boilerplate if webgl2 is false and it lacks #version and void main", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, false);
    expect(result).not.toContain("#version 300 es");
    expect(result).not.toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
  });
});
