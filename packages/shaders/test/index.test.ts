import { describe, expect, test } from "bun:test";
import { wrapFragmentSource, createFullscreenFragment } from "../src/index.js";

describe("shaders", () => {
  describe("wrapFragmentSource", () => {
    test("returns unmodified source if it starts with #version", () => {
      const source = "#version 300 es\nvoid main() {}";
      expect(wrapFragmentSource(source, true)).toBe(source);
      expect(wrapFragmentSource(source, false)).toBe(source);
    });

    test("returns unmodified source if it contains void main", () => {
      const source = "void main() { gl_FragColor = vec4(1.0); }";
      expect(wrapFragmentSource(source, true)).toBe(source);
      expect(wrapFragmentSource(source, false)).toBe(source);
    });

    test("wraps source for WebGL2", () => {
      const source = "return vec4(1.0);";
      const wrapped = wrapFragmentSource(source, true);
      expect(wrapped).toContain("#version 300 es");
      expect(wrapped).toContain("outColor = shade(uv, u_time);");
      expect(wrapped).toContain(source);
    });

    test("wraps source for WebGL1", () => {
      const source = "return vec4(1.0);";
      const wrapped = wrapFragmentSource(source, false);
      expect(wrapped).not.toContain("#version 300 es");
      expect(wrapped).toContain("gl_FragColor = shade(uv, u_time);");
      expect(wrapped).toContain(source);
    });
  });

  describe("createFullscreenFragment", () => {
    test("creates fragment and vertex for WebGL2", () => {
      const source = "return vec4(1.0);";
      const result = createFullscreenFragment(source, true);
      expect(result.vertex).toContain("#version 300 es");
      expect(result.fragment).toContain("#version 300 es");
    });

    test("creates fragment and vertex for WebGL1", () => {
      const source = "return vec4(1.0);";
      const result = createFullscreenFragment(source, false);
      expect(result.vertex).toContain("attribute vec2 a_pos;");
      expect(result.fragment).not.toContain("#version 300 es");
    });
  });
});
