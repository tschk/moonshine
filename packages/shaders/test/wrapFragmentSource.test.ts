import { describe, expect, test } from "bun:test";
import { wrapFragmentSource } from "../src/index.ts";

describe("wrapFragmentSource", () => {
  test("returns source unchanged if it starts with #version", () => {
    const source = "#version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("returns source unchanged if it includes void main", () => {
    const source = "precision highp float;\nvoid main() {}";
    expect(wrapFragmentSource(source, true)).toBe(source);
    expect(wrapFragmentSource(source, false)).toBe(source);
  });

  test("trims whitespace before checking for #version or void main", () => {
    const sourceVersion = "  \n  #version 300 es\nvoid main() {}";
    expect(wrapFragmentSource(sourceVersion, true)).toBe(sourceVersion);

    const sourceMain = "  \n  void main() {}";
    expect(wrapFragmentSource(sourceMain, true)).toBe(sourceMain);
  });

  test("wraps source in WebGL2 boilerplate if webgl2 is true", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, true);

    expect(result).toContain("#version 300 es");
    expect(result).toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("outColor = shade(uv, u_time);");
  });

  test("wraps source in WebGL1 boilerplate if webgl2 is false", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = wrapFragmentSource(source, false);

    expect(result).not.toContain("#version 300 es");
    expect(result).not.toContain("out vec4 outColor;");
    expect(result).toContain(source);
    expect(result).toContain("gl_FragColor = shade(uv, u_time);");
  });
});
