import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolveAlias, tanstackAliases, tsconfigPaths } from "../src/aliases";

const specifiers = Object.keys(tanstackAliases);

describe("TanStack aliases", () => {
  test("covers the packages this one replaces", () => {
    expect(specifiers.sort()).toEqual([
      "@tanstack/react-router",
      "@tanstack/router-core",
    ]);
  });

  test("maps every specifier onto this package", () => {
    for (const to of Object.values(tanstackAliases)) {
      expect(to).toBe("@tschk/moonshine-tanstack");
    }
  });

  test("resolveAlias points at a file that exists", () => {
    for (const specifier of specifiers) {
      const path = resolveAlias(specifier);
      expect({ specifier, ok: path !== undefined && existsSync(path) }).toEqual(
        {
          specifier,
          ok: true,
        },
      );
    }
  });

  test("resolveAlias ignores anything it does not own", () => {
    expect(resolveAlias("@tanstack/react-query")).toBeUndefined();
    expect(resolveAlias("react")).toBeUndefined();
  });

  test("the resolved module exposes the TanStack Router surface", async () => {
    const mod = (await import(
      resolveAlias("@tanstack/react-router")!
    )) as Record<string, unknown>;
    for (const name of [
      "Link",
      "Navigate",
      "Outlet",
      "useNavigate",
      "useRouter",
      "useRouterState",
      "useParams",
      "useSearch",
      "redirect",
      "notFound",
    ]) {
      expect(typeof mod[name], `missing ${name}`).toBe("function");
    }
  });

  test("tsconfigPaths mirrors the alias map in paths form", () => {
    expect(tsconfigPaths()).toEqual({
      "@tanstack/react-router": ["@tschk/moonshine-tanstack"],
      "@tanstack/router-core": ["@tschk/moonshine-tanstack"],
    });
  });

  test("the Bun plugin rewrites @tanstack/react-router without touching app source", async () => {
    const proc = Bun.spawnSync([
      "bun",
      `${import.meta.dir}/build-fixture.ts`,
      "moonshineTanstackPlugin",
      "fixtures/tanstack-app.ts",
    ]);
    expect(proc.exitCode, proc.stderr.toString()).toBe(0);
    const code = proc.stdout.toString();
    expect(code).not.toMatch(/from\s*["']@tanstack\//);
    expect(code).toContain("data-status");
  });
});
