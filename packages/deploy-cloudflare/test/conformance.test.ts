import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  MANIFEST_VERSION,
  type MoonshineManifest,
  type RouteArtifact,
} from "@tschk/moonshine-framework";
import { adapterConformance } from "@tschk/moonshine-adapter-conformance";
import {
  cloudflareAdapter,
  cloudflareFetch,
  cloudflareHarness,
} from "../src/index.js";

const pageFile = resolve(
  import.meta.dir,
  "../../adapter-conformance/src/fixtures/Page.tsx",
);

const baseManifest: MoonshineManifest = {
  version: MANIFEST_VERSION,
  frameworkVersion: "0.2.0",
  routes: [],
  assets: [],
  entries: {},
  capabilities: ["streaming"],
};

describe("cloudflare adapter", () => {
  adapterConformance(cloudflareAdapter, cloudflareHarness);

  test("rejects node routes", async () => {
    const buildDir = mkdtempSync(resolve(tmpdir(), "ms-cf-reject-"));
    const route: RouteArtifact = {
      id: "node",
      path: "/node-route",
      file: "node.ts",
      mode: "ssr",
      runtime: "node",
      decision: "fixture",
      clientEntries: [],
    };
    const manifest: MoonshineManifest = {
      version: MANIFEST_VERSION,
      frameworkVersion: "0.2.0",
      routes: [route],
      assets: [],
      entries: {},
      capabilities: cloudflareAdapter.capabilities,
    };
    await expect(cloudflareAdapter.build(manifest, buildDir)).rejects.toThrow(
      "/node-route",
    );
    await expect(cloudflareAdapter.build(manifest, buildDir)).rejects.toThrow(
      "node",
    );
    await expect(cloudflareAdapter.build(manifest, buildDir)).rejects.toThrow(
      "cloudflare",
    );
    rmSync(buildDir, { recursive: true, force: true });
  });

  test("rejects bun and vercel-edge routes", async () => {
    const buildDir = mkdtempSync(resolve(tmpdir(), "ms-cf-reject2-"));
    for (const runtime of ["bun", "vercel-edge"] as const) {
      const manifest: MoonshineManifest = {
        version: MANIFEST_VERSION,
        frameworkVersion: "0.2.0",
        routes: [
          {
            id: runtime,
            path: `/${runtime}`,
            file: `${runtime}.ts`,
            mode: "ssr",
            runtime,
            decision: "fixture",
            clientEntries: [],
          } as RouteArtifact,
        ],
        assets: [],
        entries: {},
        capabilities: cloudflareAdapter.capabilities,
      };
      await expect(cloudflareAdapter.build(manifest, buildDir)).rejects.toThrow(
        `"/${runtime}"`,
      );
    }
    rmSync(buildDir, { recursive: true, force: true });
  });

  test("does not silently downgrade streaming", async () => {
    expect(cloudflareAdapter.capabilities).toContain("streaming");
    const manifest: MoonshineManifest = {
      version: MANIFEST_VERSION,
      frameworkVersion: "0.2.0",
      routes: [],
      assets: [],
      entries: {},
      capabilities: ["streaming"],
    };
    const buildDir = mkdtempSync(resolve(tmpdir(), "ms-cf-cap-"));
    await cloudflareAdapter.build(manifest, buildDir);
    rmSync(buildDir, { recursive: true, force: true });
  });
});

describe("cloudflare fetch", () => {
  test("serves static assets through env.ASSETS", async () => {
    const request = new Request("http://localhost/app.css");
    const env = {
      ASSETS: {
        fetch: async (req: Request) => {
          if (new URL(req.url).pathname === "/app.css") {
            return new Response("body{}", {
              headers: { "content-type": "text/css" },
            });
          }
          return new Response("not found", { status: 404 });
        },
      },
    };
    const res = await cloudflareFetch(
      request,
      env,
      { waitUntil: () => {} },
      {
        ...baseManifest,
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toBe("body{}");
  });

  test("returns 404 when no matching route", async () => {
    const res = await cloudflareFetch(
      new Request("http://localhost/not-found"),
      {},
      { waitUntil: () => {} },
      baseManifest,
    );
    expect(res.status).toBe(404);
  });
});

describe("cloudflare cache", () => {
  let originalCaches: unknown;
  let stored = new Map<string, Response>();
  let putCount = 0;
  let matchCount = 0;

  const cache = {
    match: async (request: Request) => {
      matchCount++;
      return stored.get(request.url);
    },
    put: async (request: Request, response: Response) => {
      putCount++;
      const text = await response.text();
      stored.set(
        request.url,
        new Response(text, { headers: response.headers }),
      );
    },
  };

  beforeEach(() => {
    originalCaches = (globalThis as { caches?: unknown }).caches;
    (globalThis as { caches?: unknown }).caches = { default: cache };
    stored = new Map();
    putCount = 0;
    matchCount = 0;
  });

  afterEach(() => {
    (globalThis as { caches?: unknown }).caches = originalCaches;
  });

  test("uses caches.default only when route declares cache", async () => {
    const cachedRoute: RouteArtifact = {
      id: "about",
      path: "/about",
      file: pageFile,
      mode: "static",
      runtime: "cloudflare",
      decision: "fixture",
      clientEntries: [],
      cache: { control: "max-age=60" },
    };
    const manifest: MoonshineManifest = {
      ...baseManifest,
      routes: [cachedRoute],
    };

    const first = await cloudflareFetch(
      new Request("http://localhost/about"),
      {},
      { waitUntil: () => {} },
      manifest,
    );
    expect(first.status).toBe(200);
    expect(matchCount).toBe(1);
    expect(putCount).toBe(1);

    const second = await cloudflareFetch(
      new Request("http://localhost/about"),
      {},
      { waitUntil: () => {} },
      manifest,
    );
    expect(second.status).toBe(200);
    expect(matchCount).toBe(2);
    expect(putCount).toBe(1);
    const firstText = await first.text();
    const secondText = await second.text();
    expect(secondText).toBe(firstText);
  });

  test("does not cache when route has no cache policy", async () => {
    const uncachedRoute: RouteArtifact = {
      id: "home",
      path: "/",
      file: pageFile,
      mode: "static",
      runtime: "cloudflare",
      decision: "fixture",
      clientEntries: [],
    };
    const manifest: MoonshineManifest = {
      ...baseManifest,
      routes: [uncachedRoute],
    };

    await cloudflareFetch(
      new Request("http://localhost/"),
      {},
      { waitUntil: () => {} },
      manifest,
    );
    expect(matchCount).toBe(0);
    expect(putCount).toBe(0);
  });

  test("bypasses an existing entry for credentials and before middleware", async () => {
    const route: RouteArtifact = {
      id: "secure",
      path: "/secure",
      file: "secure.ts",
      mode: "ssr",
      runtime: "cloudflare",
      decision: "fixture",
      clientEntries: [],
      cache: { control: "public, max-age=60" },
    };
    const manifest = { ...baseManifest, routes: [route] };
    stored.set("http://localhost/secure", new Response("cached"));
    let calls = 0;
    const renderer = {
      name: "test",
      render: async () =>
        new Response(`rendered ${++calls}`, {
          headers: { "cache-control": "public, max-age=60" },
        }),
      prerender: async () => "",
    };
    const credentialHeaders: Record<string, string>[] = [
      { cookie: "session=one" },
      { authorization: "Bearer token" },
    ];
    for (const headers of credentialHeaders) {
      const response = await cloudflareFetch(
        new Request("http://localhost/secure", { headers }),
        {},
        { waitUntil: () => {} },
        manifest,
        {},
        renderer,
      );
      expect(await response.text()).toStartWith("rendered");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    let middlewareCalls = 0;
    const modules = {
      secure: {
        before: [
          async (_ctx: unknown, next: () => Promise<Response>) => {
            middlewareCalls++;
            return next();
          },
        ],
      },
    };
    const response = await cloudflareFetch(
      new Request("http://localhost/secure"),
      {},
      { waitUntil: () => {} },
      manifest,
      modules,
      renderer,
    );
    expect(await response.text()).toStartWith("rendered");
    expect(middlewareCalls).toBe(1);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const afterResponse = await cloudflareFetch(
      new Request("http://localhost/secure"),
      {},
      { waitUntil: () => {} },
      manifest,
      { secure: { after: [async (_ctx, next) => next()] } },
      renderer,
    );
    expect(await afterResponse.text()).toStartWith("rendered");
    expect(afterResponse.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(matchCount).toBe(0);
    expect(putCount).toBe(0);
  });

  test("does not store private, no-store, cookie-setting or varying responses", async () => {
    const route: RouteArtifact = {
      id: "page",
      path: "/page",
      file: "page.ts",
      mode: "ssr",
      runtime: "cloudflare",
      decision: "fixture",
      clientEntries: [],
      cache: { control: "public, max-age=60" },
    };
    const manifest = { ...baseManifest, routes: [route] };
    const responseHeaders: Record<string, string>[] = [
      { "cache-control": "private, max-age=60" },
      { "cache-control": "no-store" },
      { "set-cookie": "session=one", "cache-control": "public, max-age=60" },
      { vary: "Accept-Language", "cache-control": "public, max-age=60" },
    ];
    for (const headers of responseHeaders) {
      let calls = 0;
      const renderer = {
        name: "test",
        render: async () => new Response(`response ${++calls}`, { headers }),
        prerender: async () => "",
      };
      for (let i = 1; i <= 2; i++) {
        const response = await cloudflareFetch(
          new Request("http://localhost/page"),
          {},
          { waitUntil: () => {} },
          manifest,
          {},
          renderer,
        );
        expect(await response.text()).toBe(`response ${i}`);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
    }
    expect(putCount).toBe(0);
  });
});
