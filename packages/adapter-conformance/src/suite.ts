import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
  type DeploymentAdapter,
  type MoonshineManifest,
  type RenderContext,
  type RouteArtifact,
} from "@tschk/moonshine-framework";
import {
  createRequestHandler,
  json,
  redirect,
  type RouteModule,
} from "@tschk/moonshine-server";
import { reactRenderer, type Renderer } from "@tschk/moonshine-react";

export type Harness = {
  start(): Promise<URL>;
  stop(): Promise<void>;
};

export type HarnessFactory = (
  fetch: (request: Request) => Promise<Response>,
  options: { manifest: MoonshineManifest; staticDir: string },
) => Harness;

const pageFile = resolve(import.meta.dir, "fixtures", "Page.tsx");

function getRouteData(context: RenderContext): unknown {
  const data = context.data as Record<string, unknown> | undefined;
  if (data && context.route.id in data) return data[context.route.id];
  return context.data;
}

const conformanceRenderer: Renderer = {
  name: "conformance",
  async prerender(context) {
    if (context.route.id === "stream") return "stream";
    return reactRenderer.prerender({
      ...context,
      data: getRouteData(context),
    });
  },
  async render(context) {
    if (context.route.id === "stream") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("chunk1\n"));
          const t = setTimeout(() => {
            controller.enqueue(encoder.encode("chunk2\n"));
            controller.close();
          }, 50);
          context.signal.addEventListener("abort", () => {
            clearTimeout(t);
            try {
              controller.error(new Error("aborted"));
            } catch {}
          });
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return reactRenderer.render({
      ...context,
      data: getRouteData(context),
    });
  },
};

export function adapterConformance(
  adapter: DeploymentAdapter,
  createHarness: HarnessFactory,
): void {
  describe(`${adapter.name} adapter conformance`, () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), "ms-conf-"));
    const staticDir = resolve(tmpDir, "public");
    const assetFile = resolve(staticDir, "app.css");
    const css = "body { background: #000; }";
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(assetFile, css);

    let slowAborted = false;

    const routes: RouteArtifact[] = [
      {
        id: "home",
        path: "/",
        file: pageFile,
        mode: "static",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "about",
        path: "/about",
        file: pageFile,
        mode: "static",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "hello",
        path: "/hello/:name",
        file: pageFile,
        mode: "ssr",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "dashboard",
        path: "/dashboard/*",
        file: pageFile,
        mode: "spa",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: ["/client.js"],
      },
      {
        id: "api-method",
        path: "/api/method",
        file: pageFile,
        mode: "api",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "old",
        path: "/old",
        file: pageFile,
        mode: "ssr",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "headers",
        path: "/headers",
        file: pageFile,
        mode: "ssr",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: [],
        headers: { "x-moonshine": "ok" },
      },
      {
        id: "stream",
        path: "/stream",
        file: pageFile,
        mode: "ssr",
        runtime: adapter.runtimes[0]!,
        decision: "fixture",
        clientEntries: [],
      },
      {
        id: "slow",
        path: "/slow",
        file: pageFile,
        mode: "ssr",
        runtime: adapter.runtimes[0]!,
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
      capabilities: adapter.capabilities,
    };

    const modules: Record<string, RouteModule> = {
      home: { loader: () => ({ title: "Home", mode: "static" }) },
      about: { loader: () => ({ title: "About", mode: "static" }) },
      hello: {
        loader: (ctx) => ({
          title: `Hello ${ctx.params.name}`,
          mode: "ssr",
          message: ctx.params.name,
        }),
      },
      dashboard: {},
      "api-method": {
        loader: (ctx) => ({
          method: ctx.request.method,
          header: ctx.request.headers.get("x-test-header"),
        }),
        action: async (ctx) => {
          const body = await new Response(ctx.request.body).text();
          return json({ method: ctx.request.method, body });
        },
      },
      old: {
        loader: () => {
          throw redirect("/new");
        },
      },
      headers: { loader: () => ({ title: "Headers", mode: "ssr" }) },
      stream: { loader: () => ({ title: "Stream", mode: "ssr" }) },
      slow: {
        loader: async (ctx) => {
          await new Promise<void>((resolve) => {
            const id = setInterval(() => {
              if (ctx.signal.aborted) {
                slowAborted = true;
                clearInterval(id);
                resolve();
              }
            }, 20);
            setTimeout(() => {
              clearInterval(id);
              resolve();
            }, 500);
          });
          return { title: "Slow" };
        },
      },
    };

    const handler = createRequestHandler({
      manifest,
      modules,
      renderer: conformanceRenderer,
    });

    const harness = createHarness(handler, { manifest, staticDir });
    let url: URL;

    beforeAll(async () => {
      url = await harness.start();
    });

    afterAll(async () => {
      await harness.stop();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    function buildUrl(path: string): string {
      return new URL(path, url).href;
    }

    test("serves manifest assets", async () => {
      const res = await fetch(new Request(buildUrl("/app.css")));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/css");
      expect(await res.text()).toBe(css);
    });

    test("renders static HTML", async () => {
      const res = await fetch(new Request(buildUrl("/about")));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const text = await res.text();
      expect(text).toContain('data-moonshine-mode="static"');
      expect(text).toContain("About");
    });

    test("renders SSR with loader data", async () => {
      const res = await fetch(new Request(buildUrl("/hello/world")));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const text = await res.text();
      expect(text).toContain('data-moonshine-mode="ssr"');
      expect(text).toContain("Hello world");
      expect(text).toContain("<dd>world</dd>");
    });

    test("streams response chunks", async () => {
      const res = await fetch(new Request(buildUrl("/stream")));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }
      const text = chunks.join("");
      expect(text).toContain("chunk1");
      expect(text).toContain("chunk2");
    });

    test("returns SPA shell and splat fallback", async () => {
      for (const path of ["/dashboard", "/dashboard/foo/bar"]) {
        const res = await fetch(new Request(buildUrl(path)));
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('data-moonshine-app="dashboard"');
        expect(text).toContain(
          '<script type="module" src="/client.js"></script>',
        );
      }
    });

    test("handles API GET", async () => {
      const res = await fetch(
        new Request(buildUrl("/api/method"), {
          headers: { "x-test-header": "42" },
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const data = (await res.json()) as Record<string, unknown>;
      expect((data["api-method"] as Record<string, string>).method).toBe("GET");
      expect((data["api-method"] as Record<string, string>).header).toBe("42");
    });

    test("handles API POST", async () => {
      const res = await fetch(
        new Request(buildUrl("/api/method"), {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "payload",
        }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, string>;
      expect(data.method).toBe("POST");
      expect(data.body).toBe("payload");
    });

    test("returns 404 for missing routes", async () => {
      const res = await fetch(new Request(buildUrl("/not-found")));
      expect(res.status).toBe(404);
    });

    test("preserves redirects", async () => {
      const res = await fetch(
        new Request(buildUrl("/old"), { redirect: "manual" }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/new");
    });

    test("forwards request and response headers", async () => {
      const res = await fetch(new Request(buildUrl("/headers")));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-moonshine")).toBe("ok");
    });

    test("forwards request cancellation", async () => {
      const controller = new AbortController();
      const req = new Request(buildUrl("/slow"), {
        signal: controller.signal,
      });
      const promise = fetch(req);
      await new Promise((r) => setTimeout(r, 100));
      controller.abort();
      await expect(promise).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 600));
      expect(slowAborted).toBe(true);
      const res = await fetch(new Request(buildUrl("/")));
      expect(res.status).toBe(200);
    });

    test("builds deploy output", async () => {
      const buildDir = mkdtempSync(
        resolve(tmpdir(), `ms-${adapter.name}-build-`),
      );
      const buildManifest: MoonshineManifest = {
        ...manifest,
        assets: manifest.assets.map((a) => ({ ...a })),
      };
      await adapter.build(buildManifest, buildDir);
      expect(existsSync(resolve(buildDir, "app.css"))).toBe(true);
      expect(existsSync(resolve(buildDir, "server.ts"))).toBe(true);
      expect(existsSync(resolve(buildDir, "manifest.json"))).toBe(true);
      const built = readFileSync(resolve(buildDir, "app.css"), "utf8");
      expect(built).toBe(css);
      rmSync(buildDir, { recursive: true, force: true });
    });

    test("stops gracefully", async () => {
      const h = createHarness(handler, { manifest, staticDir });
      const u = await h.start();
      const res = await fetch(new Request(new URL("/", u).href));
      expect(res.status).toBe(200);
      await res.text();
      await h.stop();
    });
  });
}
