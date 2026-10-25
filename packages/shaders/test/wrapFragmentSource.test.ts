import { describe, it, expect } from "bun:test";
import { wrapFragmentSource } from "../src/index.js";

describe("wrapFragmentSource", () => {
  it("returns source verbatim if it starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns source verbatim if it contains void main", () => {
    const source = "void main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns source verbatim if it contains #version after leading whitespace", () => {
    const source = "  \n  #version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("wraps source in WebGL2 boilerplate when webgl2 === true", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, true);
    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  it("wraps source in WebGL1 boilerplate when webgl2 === false", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, false);
    expect(result).not.toContain("#version 300 es");
    expect(result).not.toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
  });
});
