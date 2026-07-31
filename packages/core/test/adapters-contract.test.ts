import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packagesRoot = join(import.meta.dir, "..", "..");
const adapters = readdirSync(packagesRoot).filter((n) =>
  n.startsWith("adapter-"),
);

/** Host library subpaths that must exist for stack fidelity. */
const REQUIRED_HOST_EXPORTS: Record<string, string[]> = {
  "adapter-next": [
    "./navigation",
    "./link",
    "./image",
    "./headers",
    "./shaders",
    "./server",
    "./client",
  ],
  "adapter-remix": ["./react", "./hooks"],
  "adapter-tanstack": ["./query", "./router"],
  "adapter-vue": ["./vue"],
  "adapter-svelte": ["./store"],
  "adapter-solid": ["./solid", "./store", "./h"],
  "adapter-nuxt": ["./app", "./vue"],
  "adapter-astro": ["./react", "./shaders"],
  "adapter-waku": ["./router", "./shaders"],
  "adapter-angular": ["./rxjs"],
};

describe("adapter contracts", () => {
  test("discovers all adapters", () => {
    expect(adapters.sort()).toEqual(
      [
        "adapter-angular",
        "adapter-astro",
        "adapter-next",
        "adapter-nuxt",
        "adapter-remix",
        "adapter-solid",
        "adapter-svelte",
        "adapter-tanstack",
        "adapter-vue",
        "adapter-waku",
      ].sort(),
    );
  });

  test("export targets exist and required host libs listed", () => {
    for (const name of adapters) {
      const pkg = JSON.parse(
        readFileSync(join(packagesRoot, name, "package.json"), "utf8"),
      ) as { exports?: Record<string, string> };
      const exports = pkg.exports ?? {};
      for (const [key, target] of Object.entries(exports)) {
        expect(existsSync(join(packagesRoot, name, target))).toBe(true);
      }
      const required = REQUIRED_HOST_EXPORTS[name] ?? [];
      for (const key of required) {
        expect(exports[key], `${name} missing export ${key}`).toBeTruthy();
      }
    }
  });

  test("next/remix/tanstack roots do not export MoonshineRouter", () => {
    for (const name of ["adapter-next", "adapter-remix", "adapter-tanstack"]) {
      const index = readFileSync(
        join(packagesRoot, name, "src/index.ts"),
        "utf8",
      );
      // Allow mentions in comments; forbid live exports/imports of the router.
      const code = index
        .split("\n")
        .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toMatch(/\bexport\b[\s\S]*\bMoonshineRouter\b/);
      expect(code).not.toMatch(/\bMoonshineRouter\b[\s\S]*\bfrom\b/);
    }
  });
});
