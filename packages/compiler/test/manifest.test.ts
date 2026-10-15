import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { readManifest } from "../src/manifest";
import { buildProjectIsolated } from "./build-in-subprocess";

const projectDir = resolve(import.meta.dir, "fixtures", "project");
const outDir = join(projectDir, ".moonshine");

function clean() {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
}

afterAll(clean);

describe("buildProject", () => {
  test("emits a versioned, deterministic manifest with relative paths", async () => {
    await buildProjectIsolated({
      projectDir,
    });
    const manifest = await readManifest(join(outDir, "manifest.json"));

    expect(manifest.version).toBe(1);
    expect(manifest.frameworkVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.routes.map((r) => r.path)).toEqual([
      "/",
      "/about",
      "/api/health",
      "/client",
      "/counter",
      "/docs/*path",
    ]);
    expect(manifest.routes.map((r) => r.mode)).toEqual([
      "static",
      "ssr",
      "api",
      "spa",
      "island",
      "static",
    ]);
    expect(manifest.routes.map((r) => r.decision)).toEqual([
      "deterministic build-time route",
      "uses request-time server data",
      "exports request handler",
      "route root is a client boundary",
      "contains an interactive client subtree",
      "deterministic build-time route",
    ]);
    expect(manifest.routes.every((r) => r.runtime === "bun")).toBe(true);
    expect(manifest.entries.server).toBe("dist/server.js");
    expect(manifest.entries.client).toBe("/client.js");
    expect(manifest.capabilities).toEqual(["islands", "streaming"]);
    // Client assets build into public/ because that is the only directory the
    // server exposes; the server bundle must stay outside it.
    expect(manifest.assets.map((a) => a.file)).toEqual([
      "dist/server.js",
      "public/client.js",
    ]);
    for (const asset of manifest.assets) {
      const served = asset.file.startsWith("public/");
      expect(asset.path).toBe(
        served ? `/${asset.file.slice("public/".length)}` : `/${asset.file}`,
      );
      expect(asset.integrity).toMatch(/^sha256-[A-Za-z0-9+/]+=?$/);
    }

    const fromDisk = await readManifest(join(outDir, "manifest.json"));
    expect(fromDisk.version).toBe(1);
    expect(fromDisk.routes.map((r) => r.path)).toEqual(
      manifest.routes.map((r) => r.path),
    );

    const text = JSON.stringify(manifest);
    expect(text).not.toMatch(/\\\\/);
    expect(text).not.toMatch(/^\//);
    expect(text).not.toMatch(/process\.env/);

    for (const route of manifest.routes) {
      expect(route.file.startsWith("src/")).toBe(true);
      if (route.dataFile) expect(route.dataFile.startsWith("src/")).toBe(true);
      if (route.layouts) {
        for (const l of route.layouts) {
          expect(l.startsWith("src/")).toBe(true);
        }
      }
      if (route.middleware) {
        for (const m of route.middleware) {
          expect(m.startsWith("src/")).toBe(true);
        }
      }
      if (route.errorBoundary) {
        expect(route.errorBoundary.startsWith("src/")).toBe(true);
      }
    }

    expect(manifest.routes.find((r) => r.path === "/")?.staticOutput).toBe(
      "static/index.html",
    );
    expect(
      manifest.routes.find((r) => r.path === "/docs/*path")?.staticOutput,
    ).toBeUndefined();
  });

  test("does not assign staticOutput to parameterized static paths", async () => {
    const file = join(projectDir, "src", "routes", "index.tsx");
    await buildProjectIsolated({
      projectDir,
      programmatic: [
        {
          id: "blog-slug",
          path: "/blog/:slug",
          file,
          mode: "static",
        },
        {
          id: "account-tab",
          path: "/account/:tab?",
          file,
          mode: "static",
        },
      ],
    });
    const manifest = await readManifest(join(outDir, "manifest.json"));
    expect(
      manifest.routes.find((r) => r.id === "blog-slug")?.staticOutput,
    ).toBeUndefined();
    expect(
      manifest.routes.find((r) => r.id === "account-tab")?.staticOutput,
    ).toBeUndefined();
  });
});
