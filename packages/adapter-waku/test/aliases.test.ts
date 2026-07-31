import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolveAlias, tsconfigPaths, wakuAliases } from "../src/aliases";

const specifiers = Object.keys(wakuAliases);

describe("waku aliases", () => {
  test("covers the modules this package replaces", () => {
    expect(specifiers.sort()).toEqual(["waku/router", "waku/router/client"]);
  });

  test("maps every specifier onto this package", () => {
    for (const to of Object.values(wakuAliases)) {
      expect(to).toBe("@tschk/moonshine-waku");
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

  test("resolveAlias ignores the RSC modules this package cannot replace", () => {
    expect(resolveAlias("waku/server")).toBeUndefined();
    expect(resolveAlias("waku")).toBeUndefined();
  });

  test("the resolved module exposes Waku's client router surface", async () => {
    const mod = (await import(resolveAlias("waku/router/client")!)) as Record<
      string,
      unknown
    >;
    for (const name of [
      "Link",
      "useRouter",
      "useRouter_UNSTABLE",
      "useParams_UNSTABLE",
      "useSearch_UNSTABLE",
      "useSetSearch_UNSTABLE",
      "useNavigationStatus_UNSTABLE",
    ]) {
      expect(typeof mod[name], `missing ${name}`).toBe("function");
    }
  });

  test("tsconfigPaths mirrors the alias map in paths form", () => {
    expect(tsconfigPaths()).toEqual({
      "waku/router": ["@tschk/moonshine-waku"],
      "waku/router/client": ["@tschk/moonshine-waku"],
    });
  });

  test("the Bun plugin rewrites waku/router/client without touching app source", async () => {
    const proc = Bun.spawnSync([
      "bun",
      `${import.meta.dir}/build-fixture.ts`,
      "moonshineWakuPlugin",
      "fixtures/waku-app.ts",
    ]);
    expect(proc.exitCode, proc.stderr.toString()).toBe(0);
    const code = proc.stdout.toString();
    expect(code).not.toMatch(/from\s*["']waku\//);
    expect(code).toContain("prefetch");
  });
});
