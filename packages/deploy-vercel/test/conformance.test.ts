import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
        id: "post",
        path: "/blog/:slug",
        file: pageFile,
        mode: "static",
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
      existsSync(resolve(buildDir, ".vercel/output/static/blog-:slug.html")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(buildDir, ".vercel/output/functions/post.func/index.ts"),
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
