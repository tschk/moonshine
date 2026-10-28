import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packagesRoot = join(import.meta.dir, "..", "..");
const adapters = readdirSync(packagesRoot).filter((n) =>
  n.startsWith("adapter-"),
);

/** Public adapter subpaths, including independent replacement APIs. */
const REQUIRED_EXPORTS: Record<string, string[]> = {
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
  "adapter-svelte": ["./svelte", "./store"],
  "adapter-vue": ["./vue", "./compiler-sfc"],
  "adapter-angular": ["./core", "./common"],
  "adapter-astro": ["./compiler"],
  "adapter-nuxt": ["./app", "./vue"],
  "adapter-react-router": [
    "./navigation",
    "./link",
    "./outlet",
    "./responses",
    "./server",
    "./client",
  ],
  "adapter-tanstack": [
    "./navigation",
    "./link",
    "./outlet",
    "./server",
    "./client",
  ],
  "adapter-waku": ["./router", "./link", "./server", "./client"],
};

/** Adapters that reimplement a host API must not depend on that host. */
const FORBIDDEN_DEPENDENCIES: Record<string, string[]> = {
  "adapter-solid": ["solid-js"],
  "adapter-svelte": ["svelte"],
  "adapter-next": ["next"],
  "adapter-react-router": [
    "react-router",
    "react-router-dom",
    "@remix-run/react",
  ],
  "adapter-tanstack": ["@tanstack/react-router", "@tanstack/react-start"],
  "adapter-waku": ["waku"],
};

describe("adapter contracts", () => {
  test("discovers all adapters", () => {
    expect(adapters.sort()).toEqual(
      [
        "adapter-angular",
        "adapter-astro",
        "adapter-conformance",
        "adapter-next",
        "adapter-nuxt",
        "adapter-react-router",
        "adapter-solid",
        "adapter-svelte",
        "adapter-tanstack",
        "adapter-vue",
        "adapter-waku",
      ].sort(),
    );
  });

  test("reimplementing adapters do not depend on the host they replace", () => {
    for (const [name, forbidden] of Object.entries(FORBIDDEN_DEPENDENCIES)) {
      const pkg = JSON.parse(
        readFileSync(join(packagesRoot, name, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const declared = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
      ];
      for (const host of forbidden) {
        expect(declared, `${name} must not depend on ${host}`).not.toContain(
          host,
        );
      }
    }
  });

  test("reimplementing adapters do not import the host they replace", () => {
    for (const [name, forbidden] of Object.entries(FORBIDDEN_DEPENDENCIES)) {
      const dir = join(packagesRoot, name, "src");
      const files = readdirSync(dir, { recursive: true }) as string[];
      for (const file of files) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
        if (file.endsWith(".d.ts")) continue;
        const imports = new Bun.Transpiler({
          loader: file.endsWith(".tsx") ? "tsx" : "ts",
        }).scan(readFileSync(join(dir, file), "utf8")).imports;
        for (const host of forbidden) {
          expect(
            imports.some(
              ({ path }) => path === host || path.startsWith(host + "/"),
            ),
            `${name}/${file} must not import ${host}`,
          ).toBe(false);
        }
      }
    }
  });

  test("export targets exist and required adapter APIs are listed", () => {
    for (const name of adapters) {
      const pkg = JSON.parse(
        readFileSync(join(packagesRoot, name, "package.json"), "utf8"),
      ) as { exports?: Record<string, string> };
      const exports = pkg.exports ?? {};
      for (const target of Object.values(exports)) {
        expect(existsSync(join(packagesRoot, name, target))).toBe(true);
      }
      const required = REQUIRED_EXPORTS[name] ?? [];
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
