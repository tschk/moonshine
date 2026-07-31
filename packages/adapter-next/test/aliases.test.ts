import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { nextAliases, resolveAlias, tsconfigPaths } from "../src/aliases";

const specifiers = Object.keys(nextAliases);

describe("next/* aliases", () => {
  test("covers every Next module this package reimplements", () => {
    expect(specifiers.sort()).toEqual([
      "next/dynamic",
      "next/font/google",
      "next/headers",
      "next/image",
      "next/link",
      "next/navigation",
      "next/script",
    ]);
  });

  test("maps each specifier onto a @tschk/moonshine-next subpath", () => {
    for (const [from, to] of Object.entries(nextAliases)) {
      expect(to).toBe(`@tschk/moonshine-next/${from.slice("next/".length)}`);
    }
  });

  test("resolveAlias points at a file that exists", () => {
    for (const specifier of specifiers) {
      const path = resolveAlias(specifier);
      expect({ specifier, path: path && existsSync(path) }).toEqual({
        specifier,
        path: true,
      });
    }
  });

  test("resolveAlias ignores anything it does not own", () => {
    expect(resolveAlias("next/server")).toBeUndefined();
    expect(resolveAlias("react")).toBeUndefined();
  });

  test("each resolved module really imports", async () => {
    for (const specifier of specifiers) {
      const mod = (await import(resolveAlias(specifier)!)) as Record<
        string,
        unknown
      >;
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    }
  });

  test("the aliased default export is the component Next apps expect", async () => {
    for (const specifier of ["next/link", "next/image", "next/script"]) {
      const mod = (await import(resolveAlias(specifier)!)) as {
        default: unknown;
      };
      expect(typeof mod.default).toBe("function");
    }
  });

  test("tsconfigPaths mirrors the alias map in paths form", () => {
    expect(tsconfigPaths()).toEqual({
      "next/link": ["@tschk/moonshine-next/link"],
      "next/navigation": ["@tschk/moonshine-next/navigation"],
      "next/image": ["@tschk/moonshine-next/image"],
      "next/script": ["@tschk/moonshine-next/script"],
      "next/headers": ["@tschk/moonshine-next/headers"],
      "next/dynamic": ["@tschk/moonshine-next/dynamic"],
      "next/font/google": ["@tschk/moonshine-next/font/google"],
    });
  });

  test("the Bun plugin rewrites next/* without touching app source", async () => {
    const proc = Bun.spawnSync([
      "bun",
      `${import.meta.dir}/build-fixture.ts`,
      "moonshineNextPlugin",
      "fixtures/next-app.ts",
    ]);
    expect(proc.exitCode, proc.stderr.toString()).toBe(0);
    const code = proc.stdout.toString();
    // The bundle must contain this package's implementation, not a next import.
    expect(code).not.toMatch(/from\s*["']next\//);
    expect(code).toContain("__moonshine_font_");
  });
});
