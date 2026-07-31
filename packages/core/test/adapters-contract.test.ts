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
  "adapter-solid": ["./solid", "./store", "./h"],
};

describe("adapter contracts", () => {
  test("discovers all adapters", () => {
    expect(adapters.sort()).toEqual(
      ["adapter-conformance", "adapter-next", "adapter-solid"].sort(),
    );
  });

  test("export targets exist and required host libs listed", () => {
    for (const name of adapters) {
      const pkg = JSON.parse(
        readFileSync(join(packagesRoot, name, "package.json"), "utf8"),
      ) as { exports?: Record<string, string> };
      const exports = pkg.exports ?? {};
      for (const target of Object.values(exports)) {
        expect(existsSync(join(packagesRoot, name, target))).toBe(true);
      }
      const required = REQUIRED_HOST_EXPORTS[name] ?? [];
      for (const key of required) {
        expect(exports[key], `${name} missing export ${key}`).toBeTruthy();
      }
    }
  });

  test("next root does not export MoonshineRouter", () => {
    for (const name of ["adapter-next"]) {
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
