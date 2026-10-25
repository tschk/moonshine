import { describe, expect, test } from "bun:test";
import { createFullscreenFragment } from "../src/index.ts";

describe("createFullscreenFragment", () => {
  test("creates a complete WebGL2 shader program by default", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = createFullscreenFragment(source);

    expect(result.vertex).toContain("#version 300 es");
    expect(result.vertex).toContain("vec2 verts[3]");

    expect(result.fragment).toContain("#version 300 es");
    expect(result.fragment).toContain("out vec4 outColor;");
    expect(result.fragment).toContain("outColor = shade(uv, u_time);");
    expect(result.fragment).toContain(source);
  });

  test("creates a complete WebGL1 shader program if webgl2 is false", () => {
    const source = "vec4 shade(vec2 uv, float t) { return vec4(1.0); }";
    const result = createFullscreenFragment(source, false);

    expect(result.vertex).toContain("attribute vec2 a_pos;");
    expect(result.vertex).not.toContain("#version 300 es");

    expect(result.fragment).not.toContain("#version 300 es");
    expect(result.fragment).toContain("gl_FragColor = shade(uv, u_time);");
    expect(result.fragment).toContain(source);
  });
});
