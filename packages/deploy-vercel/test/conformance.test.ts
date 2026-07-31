import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  MANIFEST_VERSION,
  type MoonshineManifest,
  type RouteArtifact,
} from "@tschk/moonshine-framework";
import { adapterConformance } from "@tschk/moonshine-adapter-conformance";
import { vercelAdapter, vercelHarness } from "../src/index.js";

const pageFile = resolve(
  import.meta.dir,
  "../../adapter-conformance/src/fixtures/Page.tsx",
);

describe("vercel adapter", () => {
  adapterConformance(vercelAdapter, vercelHarness);

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

describe("vercel build output", () => {
  const buildDir = mkdtempSync(resolve(tmpdir(), "ms-vc-build-"));
  const assetFile = resolve(buildDir, "public", "app.css");
  const css = "body { background: #000; }";

  beforeEach(() => {
    mkdirSync(resolve(buildDir, "public"), { recursive: true });
    writeFileSync(assetFile, css);
  });

  afterEach(() => {
    rmSync(buildDir, { recursive: true, force: true });
  });

  test("generates Vercel Build Output API v3 files", async () => {
    const routes: RouteArtifact[] = [
      {
        id: "home",
        path: "/",
        file: pageFile,
        mode: "static",
        runtime: "node",
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "about",
        path: "/about",
        file: pageFile,
        mode: "static",
        runtime: "node",
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "hello",
        path: "/hello/:name",
        file: pageFile,
        mode: "ssr",
        runtime: "node",
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "edge",
        path: "/edge",
        file: pageFile,
        mode: "ssr",
        runtime: "vercel-edge",
        decision: "fixture",
        clientEntries: [],
      },
    ];
    const manifest: MoonshineManifest = {
      version: MANIFEST_VERSION,
      frameworkVersion: "0.2.0",
      routes,
      assets: [
        {
          file: assetFile,
          path: "/app.css",
          integrity: "sha256-0000000000000000000000000000000000000000000=",
        },
      ],
      entries: { server: "server.js", client: "client.js" },
      capabilities: vercelAdapter.capabilities,
    };

    await vercelAdapter.build(manifest, buildDir);

    const configPath = resolve(buildDir, ".vercel/output/config.json");
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      version: number;
      routes: Array<{ src: string; dest: string }>;
    };
    expect(config.version).toBe(3);
    expect(Array.isArray(config.routes)).toBe(true);
    expect(config.routes.length).toBeGreaterThan(0);

    expect(
      existsSync(resolve(buildDir, ".vercel/output/static/index.html")),
    ).toBe(true);
    expect(
      existsSync(resolve(buildDir, ".vercel/output/static/about.html")),
    ).toBe(true);
    expect(existsSync(resolve(buildDir, ".vercel/output/static/app.css"))).toBe(
      true,
    );

    expect(
      existsSync(
        resolve(
          buildDir,
          ".vercel/output/functions/hello.func/.vc-config.json",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(buildDir, ".vercel/output/functions/hello.func/index.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(buildDir, ".vercel/output/functions/edge.func/.vc-config.json"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(buildDir, ".vercel/output/functions/edge.func/index.ts"),
      ),
    ).toBe(true);

    const edgeConfig = JSON.parse(
      readFileSync(
        resolve(buildDir, ".vercel/output/functions/edge.func/.vc-config.json"),
        "utf8",
      ),
    ) as { runtime: string };
    expect(edgeConfig.runtime).toBe("edge");

    const nodeConfig = JSON.parse(
      readFileSync(
        resolve(
          buildDir,
          ".vercel/output/functions/hello.func/.vc-config.json",
        ),
        "utf8",
      ),
    ) as { runtime: string; launcherType: string };
    expect(nodeConfig.runtime).toBe("nodejs20.x");
    expect(nodeConfig.launcherType).toBe("Nodejs");
  });
});
