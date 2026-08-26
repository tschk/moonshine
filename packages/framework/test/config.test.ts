import { describe, expect, test } from "bun:test";
import { defineConfig, type MoonshineConfig } from "../src/config";

describe("defineConfig", () => {
  test("returns the exact same object reference", () => {
    const config: MoonshineConfig = {};
    const result = defineConfig(config);
    expect(result).toBe(config);
  });

  test("handles empty configuration", () => {
    const result = defineConfig({});
    expect(result).toEqual({});
  });

  test("handles configuration with mode", () => {
    const result = defineConfig({ mode: "island" });
    expect(result).toEqual({ mode: "island" });
  });

  test("handles configuration with runtime", () => {
    const result = defineConfig({ runtime: "bun" });
    expect(result).toEqual({ runtime: "bun" });
  });

  test("handles full configuration", () => {
    const config = {
      mode: "ssr" as const,
      runtime: "cloudflare" as const,
    };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });

  test("preserves additional properties (type safety with generic T)", () => {
    const config = {
      mode: "spa" as const,
      customPlugin: true,
    };
    const result = defineConfig(config);
    expect(result).toEqual(config);
    // TypeScript check: result.customPlugin should exist
    expect(result.customPlugin).toBe(true);
  });
});
