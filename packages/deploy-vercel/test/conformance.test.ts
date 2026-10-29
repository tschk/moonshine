import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  MANIFEST_VERSION,
  type MoonshineManifest,
  type RouteArtifact,
} from "@tschk/moonshine-framework";
import {
  adapterConformance,
  artifactConformance,
  vercelRuntime,
} from "@tschk/moonshine-adapter-conformance";
import { vercelAdapter, vercelHarness } from "../src/index.js";

describe("vercel adapter", () => {
  adapterConformance(vercelAdapter, vercelHarness);
  artifactConformance(
    vercelAdapter,
    vercelRuntime,
    resolve(import.meta.dir, ".."),
  );

  test("rejects bun runtime", async () => {
    const buildDir = mkdtempSync(resolve(tmpdir(), "ms-vc-reject-"));
    const manifest: MoonshineManifest = {
      version: MANIFEST_VERSION,
      frameworkVersion: "0.2.0",
      routes: [
        {
          id: "bun",
          path: "/bun-route",
          file: "bun.ts",
          mode: "ssr",
          runtime: "bun",
          decision: "fixture",
          clientEntries: [],
        } as RouteArtifact,
      ],
      assets: [],
      entries: {},
      capabilities: vercelAdapter.capabilities,
    };
    await expect(vercelAdapter.build(manifest, buildDir)).rejects.toThrow(
      "/bun-route",
    );
    await expect(vercelAdapter.build(manifest, buildDir)).rejects.toThrow(
      "bun",
    );
    await expect(vercelAdapter.build(manifest, buildDir)).rejects.toThrow(
      "vercel",
    );
    rmSync(buildDir, { recursive: true, force: true });
  });

  test("rejects cloudflare runtime", async () => {
    const buildDir = mkdtempSync(resolve(tmpdir(), "ms-vc-cf-"));
    const manifest: MoonshineManifest = {
      version: MANIFEST_VERSION,
      frameworkVersion: "0.2.0",
      routes: [
        {
          id: "cf",
          path: "/cf",
          file: "cf.ts",
          mode: "ssr",
          runtime: "cloudflare",
          decision: "fixture",
          clientEntries: [],
        } as RouteArtifact,
      ],
      assets: [],
      entries: {},
      capabilities: vercelAdapter.capabilities,
    };
    await expect(vercelAdapter.build(manifest, buildDir)).rejects.toThrow(
      "/cf",
    );
    await expect(vercelAdapter.build(manifest, buildDir)).rejects.toThrow(
      "cloudflare",
    );
    rmSync(buildDir, { recursive: true, force: true });
  });

  test("does not silently downgrade streaming", async () => {
    expect(vercelAdapter.capabilities).toContain("streaming");
    const buildDir = mkdtempSync(resolve(tmpdir(), "ms-vc-cap-"));
    const manifest: MoonshineManifest = {
      version: MANIFEST_VERSION,
      frameworkVersion: "0.2.0",
      routes: [],
      assets: [],
      entries: {},
      capabilities: ["streaming"],
    };
    await vercelAdapter.build(manifest, buildDir);
    rmSync(buildDir, { recursive: true, force: true });
  });
});

test("legacy Vercel static output excludes server assets", async () => {
  const buildDir = mkdtempSync(resolve(tmpdir(), "ms-vc-private-"));
  try {
    mkdirSync(resolve(buildDir, "public"), { recursive: true });
    mkdirSync(resolve(buildDir, "dist"), { recursive: true });
    mkdirSync(resolve(buildDir, ".vercel/output/static/dist"), {
      recursive: true,
    });
    writeFileSync(
      resolve(buildDir, ".vercel/output/static/dist/server.js"),
      "STALE_PRIVATE_SERVER",
    );
    writeFileSync(resolve(buildDir, "public/client.js"), "public client");
    writeFileSync(
      resolve(buildDir, "public/source.css"),
      "aliased public asset",
    );
    writeFileSync(resolve(buildDir, "external.css"), "external public asset");
    for (const name of ["100%.svg", "a%20b.svg", "a b.svg"])
      writeFileSync(resolve(buildDir, "public", name), name);
    writeFileSync(resolve(buildDir, "dist/server.js"), "PRIVATE_SERVER_MARKER");
    symlinkSync(
      resolve(buildDir, "dist/server.js"),
      resolve(buildDir, "public/leak.js"),
    );
    await vercelAdapter.build(
      {
        version: MANIFEST_VERSION,
        frameworkVersion: "0.4.2",
        routes: [],
        entries: {},
        capabilities: [],
        assets: [
          { file: "public/client.js", path: "/client.js" },
          { file: "public/source.css", path: "/alias.css" },
          { file: resolve(buildDir, "external.css"), path: "/external.css" },
          { file: "dist/server.js", path: "/dist/server.js" },
          ...["100%.svg", "a%20b.svg", "a b.svg"].map((name) => ({
            file: `public/${name}`,
            path: `/${encodeURIComponent(name)}`,
          })),
        ],
      },
      buildDir,
    );
    expect(
      readFileSync(
        resolve(buildDir, ".vercel/output/static/client.js"),
        "utf8",
      ),
    ).toBe("public client");
    expect(
      existsSync(resolve(buildDir, ".vercel/output/static/dist/server.js")),
    ).toBe(false);
    expect(
      readFileSync(
        resolve(buildDir, ".vercel/output/static/alias.css"),
        "utf8",
      ),
    ).toBe("aliased public asset");
    expect(
      existsSync(resolve(buildDir, ".vercel/output/static/source.css")),
    ).toBe(false);
    expect(
      readFileSync(
        resolve(buildDir, ".vercel/output/static/external.css"),
        "utf8",
      ),
    ).toBe("external public asset");
    for (const name of ["100%.svg", "a%20b.svg", "a b.svg"])
      expect(
        readFileSync(resolve(buildDir, ".vercel/output/static", name), "utf8"),
      ).toBe(name);
    expect(existsSync(resolve(buildDir, ".vercel/output/static/leak.js"))).toBe(
      false,
    );
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
});

test("Vercel rejects unsafe public asset destinations", async () => {
  const buildDir = mkdtempSync(resolve(tmpdir(), "ms-vc-path-"));
  try {
    mkdirSync(resolve(buildDir, "public"), { recursive: true });
    writeFileSync(resolve(buildDir, "public/client.js"), "client");
    for (const path of [
      "/../secret",
      "/%2e%2e/secret",
      "/foo\\bar",
      "/bad\u0000name",
      "C:/secret",
    ]) {
      await expect(
        vercelAdapter.build(
          {
            version: MANIFEST_VERSION,
            frameworkVersion: "0.4.2",
            routes: [],
            entries: {},
            capabilities: [],
            assets: [{ file: "public/client.js", path }],
          },
          buildDir,
        ),
      ).rejects.toThrow("Invalid public asset path");
    }
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
});
