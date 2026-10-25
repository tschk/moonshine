import { describe, expect, it } from "bun:test";
import { wrapFragmentSource } from "../src/index";

describe("wrapFragmentSource", () => {
  it("returns source unchanged if it starts with #version", () => {
    const source = `#version 300 es\nprecision highp float;\nvoid main() {}`;
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns source unchanged if it starts with #version (with leading whitespace)", () => {
    const source = `  \n  #version 300 es\nprecision highp float;\nvoid main() {}`;
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns source unchanged if it contains void main", () => {
    const source = `precision highp float;\nvoid main() {\n  gl_FragColor = vec4(1.0);\n}`;
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("wraps source with WebGL 2 boilerplate if webgl2 is true", () => {
    const source = `vec4 shade(vec2 uv, float t) {\n  return vec4(1.0);\n}`;
    const result = wrapFragmentSource(source, true);

    expect(result).toContain(`#version 300 es`);
    expect(result).toContain(`precision highp float;`);
    expect(result).toContain(`uniform vec2 u_resolution;`);
    expect(result).toContain(`uniform float u_time;`);
    expect(result).toContain(`out vec4 outColor;`);
    expect(result).toContain(source);
    expect(result).toContain(`void main() {`);
    expect(result).toContain(`vec2 uv = gl_FragCoord.xy / u_resolution;`);
    expect(result).toContain(`outColor = shade(uv, u_time);`);
  });

  it("wraps source with WebGL 1 boilerplate if webgl2 is false", () => {
    const source = `vec4 shade(vec2 uv, float t) {\n  return vec4(1.0);\n}`;
    const result = wrapFragmentSource(source, false);

    expect(result).not.toContain(`#version 300 es`);
    expect(result).not.toContain(`out vec4 outColor;`);
    expect(result).toContain(`precision highp float;`);
    expect(result).toContain(`uniform vec2 u_resolution;`);
    expect(result).toContain(`uniform float u_time;`);
    expect(result).toContain(source);
    expect(result).toContain(`void main() {`);
    expect(result).toContain(`vec2 uv = gl_FragCoord.xy / u_resolution;`);
    expect(result).toContain(`gl_FragColor = shade(uv, u_time);`);
  });
});
