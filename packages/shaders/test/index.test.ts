import { describe, expect, it } from "bun:test";
import { createFullscreenFragment, wrapFragmentSource } from "../src/index";

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
    expect(result).toContain("precision highp float;");
    expect(result).toContain("uniform vec2 u_resolution;");
    expect(result).toContain("uniform float u_time;");
    expect(result).toContain("vec2 uv = gl_FragCoord.xy / u_resolution;");
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  it("wraps source for WebGL1", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(uv, t, 1.0); }";
    const result = wrapFragmentSource(source, false);

    expect(result).not.toContain("#version");
    expect(result).not.toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("precision highp float;");
    expect(result).toContain("uniform vec2 u_resolution;");
    expect(result).toContain("uniform float u_time;");
    expect(result).toContain("vec2 uv = gl_FragCoord.xy / u_resolution;");
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
  });
});

describe("createFullscreenFragment", () => {
  it("creates fragment and vertex for WebGL2", () => {
    const source = "return vec4(1.0);";
    const result = createFullscreenFragment(source, true);
    expect(result.vertex).toContain("#version 300 es");
    expect(result.fragment).toContain("#version 300 es");
  });

  it("creates fragment and vertex for WebGL1", () => {
    const source = "return vec4(1.0);";
    const result = createFullscreenFragment(source, false);
    expect(result.vertex).toContain("attribute vec2 a_pos;");
    expect(result.fragment).not.toContain("#version 300 es");
  });
});
