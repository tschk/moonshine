import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  reactRouterAliases,
  resolveAlias,
  tsconfigPaths,
} from "../src/aliases";

const specifiers = Object.keys(reactRouterAliases);

describe("react-router aliases", () => {
  test("covers the packages this one replaces", () => {
    expect(specifiers.sort()).toEqual([
      "@remix-run/react",
      "react-router",
      "react-router-dom",
    ]);
  });

  test("maps every specifier onto this package", () => {
    for (const to of Object.values(reactRouterAliases)) {
      expect(to).toBe("@tschk/moonshine-react-router");
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
    expect(resolveAlias("react")).toBeUndefined();
    expect(resolveAlias("@remix-run/node")).toBeUndefined();
  });

  test("the resolved module exposes the react-router surface", async () => {
    const mod = (await import(resolveAlias("react-router")!)) as Record<
      string,
      unknown
    >;
    for (const name of [
      "Link",
      "NavLink",
      "Navigate",
      "Outlet",
      "useNavigate",
      "useLocation",
      "useParams",
      "useSearchParams",
      "json",
      "redirect",
    ]) {
      expect(typeof mod[name], `missing ${name}`).toBe("function");
    }
  });

  test("tsconfigPaths mirrors the alias map in paths form", () => {
    expect(tsconfigPaths()).toEqual({
      "react-router": ["@tschk/moonshine-react-router"],
      "react-router-dom": ["@tschk/moonshine-react-router"],
      "@remix-run/react": ["@tschk/moonshine-react-router"],
    });
  });

  test("the Bun plugin rewrites react-router without touching app source", async () => {
    const proc = Bun.spawnSync([
      "bun",
      `${import.meta.dir}/build-fixture.ts`,
      "moonshineReactRouterPlugin",
      "fixtures/router-app.ts",
    ]);
    expect(proc.exitCode, proc.stderr.toString()).toBe(0);
    const code = proc.stdout.toString();
    expect(code).not.toMatch(/from\s*["']react-router/);
    expect(code).toContain("aria-current");
  });
});
