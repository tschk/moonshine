import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  exports: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [full]
      : [];
  });
}

describe("@tschk/moonshine-next package surface", () => {
  test("declares every Next subpath it reimplements", () => {
    for (const key of [
      ".",
      "./client",
      "./server",
      "./navigation",
      "./link",
      "./image",
      "./script",
      "./headers",
      "./dynamic",
      "./font/google",
      "./aliases",
      "./shaders",
    ]) {
      expect(pkg.exports[key]).toBeTruthy();
    }
  });

  test("every export target exists on disk", () => {
    for (const [key, target] of Object.entries(pkg.exports)) {
      expect({ key, exists: existsSync(join(root, target)) }).toEqual({
        key,
        exists: true,
      });
    }
  });

  test("next is not a dependency of any kind", () => {
    for (const field of [
      "dependencies",
      "peerDependencies",
      "devDependencies",
    ] as const) {
      expect(Object.keys(pkg[field] ?? {})).not.toContain("next");
    }
  });

  test("no source file imports from next", () => {
    // Anchored to a statement so the alias map's documented `next/*`
    // specifiers do not read as real imports.
    const importsNext =
      /^\s*(?:import|export)\b[^\n]*?from\s*["']next(?:\/|["'])/m;
    const offenders = sourceFiles(join(root, "src")).filter((file) =>
      importsNext.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  test("the obsolete next module shims are gone", () => {
    expect(existsSync(join(root, "src/shims.d.ts"))).toBe(false);
  });

  test("link and navigation build on the moonshine router", () => {
    const navigation = readFileSync(join(root, "src/navigation.ts"), "utf8");
    expect(navigation).toContain("@tschk/moonshine/router");
    expect(navigation).toContain("usePathnameSignal");

    const link = readFileSync(join(root, "src/link.ts"), "utf8");
    expect(link).toContain("@tschk/moonshine/router");
  });

  test("shaders module uses moonshine-shaders", () => {
    const src = readFileSync(join(root, "src/shaders.ts"), "utf8");
    expect(src).toContain("@tschk/moonshine-shaders");
    expect(src).toContain("useFragmentShader");
  });
});
