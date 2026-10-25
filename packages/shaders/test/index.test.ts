import { describe, expect, it } from "bun:test";
import { wrapFragmentSource } from "../src/index";

describe("wrapFragmentSource", () => {
  it("returns unmodified source if it starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns unmodified source if it starts with #version (with leading whitespace)", () => {
    const source = "  \n  #version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("returns unmodified source if it includes void main", () => {
    const source = "void main() { gl_FragColor = vec4(1.0); }";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  it("wraps source for WebGL2", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(uv, t, 1.0); }";
    const result = wrapFragmentSource(source, true);

    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  it("wraps source for WebGL1", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(uv, t, 1.0); }";
    const result = wrapFragmentSource(source, false);

    expect(result).not.toContain("#version");
    expect(result).not.toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
  });
});
