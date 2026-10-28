import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createRequestHandler,
  tryServeStatic,
  type RouteModule,
} from "@tschk/moonshine-server";
import { matchRoutes, createRouteGraph } from "@tschk/moonshine-router/graph";
import {
  type DeploymentAdapter,
  type Renderer,
  type MoonshineManifest,
  type Harness,
  type HarnessFactory,
  resolveManifestFiles,
  copyAssets,
  validateRuntime,
  validateCapabilities,
} from "@tschk/moonshine-framework";

export type CloudflareEnv = {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

export type CloudflareContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

export async function cloudflareFetch(
  request: Request,
  env: CloudflareEnv,
  ctx: CloudflareContext,
  manifest: MoonshineManifest,
  modules: Record<string, RouteModule> = {},
  bundledRenderer?: Renderer,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (
    env.ASSETS &&
    (request.method === "GET" || request.method === "HEAD") &&
    pathname !== "/"
  ) {
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status !== 404) return assetRes;
  }

  const graph = createRouteGraph(manifest.routes);
  const match = matchRoutes(graph, pathname);
  let renderer = bundledRenderer;
  if (!renderer) {
    const { reactRenderer, registerRouteModules } =
      await import("@tschk/moonshine-react");
    registerRouteModules(modules);
    renderer = reactRenderer;
  }
  const handler = createRequestHandler({ manifest, modules, renderer });
  const cache =
    typeof caches !== "undefined"
      ? (caches as { default?: Cache }).default
      : undefined;

  if (match && match.route.cache && cache) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await handler(request);
    if (
      response.status >= 200 &&
      response.status < 400 &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      ctx.waitUntil(
        (async () => {
          try {
            await cache.put(request.clone(), response.clone());
          } catch (err) {
            console.warn("Failed to cache response:", err);
          }
        })(),
      );
    }
    return response;
  }

  return handler(request);
}

export default cloudflareFetch;

async function buildNativeWorker(
  manifest: MoonshineManifest,
  outDir: string,
): Promise<void> {
  await writeFile(
    resolve(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await copyAssets(manifest.assets, outDir);
  await mkdir(resolve(outDir, "public"), { recursive: true });
  const entry = `import { createRequestHandler } from "@tschk/moonshine-server";
import { modules, renderer } from "./dist/server.js";
import manifest from "./manifest.json" with { type: "json" };

const handler = createRequestHandler({ manifest, modules, renderer });
export default {
  async fetch(request, env) {
    if (env.ASSETS && (request.method === "GET" || request.method === "HEAD") && new URL(request.url).pathname !== "/") {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
      if (response.body) void response.body.cancel().catch(() => {});
    }
    return handler(request);
  },
};
`;
  const entryPath = resolve(outDir, "server.ts");
  await writeFile(entryPath, entry);
  const result = await Bun.build({
    entrypoints: [entryPath],
    outdir: outDir,
    target: "browser",
    external: ["node:*"],
    packages: "bundle",
  });
  if (!result.success)
    throw new AggregateError(
      result.logs,
      "Native Cloudflare worker bundle failed",
    );
  await writeFile(
    resolve(outDir, "wrangler.jsonc"),
    JSON.stringify(
      {
        name: "moonshine-native",
        main: "server.js",
        compatibility_date: new Date().toISOString().slice(0, 10),
        compatibility_flags: ["nodejs_compat"],
        assets: {
          directory: "./public",
          binding: "ASSETS",
          run_worker_first: true,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

export const cloudflareAdapter: DeploymentAdapter = {
  name: "cloudflare",
  runtimes: ["cloudflare"],
  capabilities: ["streaming", "islands", "edge", "revalidation"],
  build: async (manifest, outDir) => {
    if (manifest.requestContext)
      throw new Error("Cloudflare request context is not supported");
    if (
      manifest.renderer === "native" &&
      (manifest.routes.some((route) => route.cache) ||
        manifest.capabilities.includes("revalidation"))
    )
      throw new Error(
        "Native Cloudflare route caching/revalidation is not implemented",
      );
    if (
      manifest.renderer === "native" &&
      manifest.routes.some((route) => route.mode === "island")
    )
      throw new Error("Native island hydration is not implemented");
    validateRuntime(cloudflareAdapter, manifest);
    validateCapabilities(cloudflareAdapter, manifest);

    await mkdir(outDir, { recursive: true });
    if (manifest.renderer === "native") {
      await buildNativeWorker(manifest, outDir);
      return;
    }
    const projectRoot = resolve(outDir, "..");
    const resolvedManifest = resolveManifestFiles(manifest, projectRoot);

    await writeFile(
      resolve(outDir, "manifest.json"),
      JSON.stringify(resolvedManifest, null, 2) + "\n",
    );
    await copyAssets(manifest.assets, outDir);

    // The module map must be a static import: Workers cannot resolve the
    // dynamic `import(route.file)` the renderer would otherwise fall back to.
    const serverEntry = `import cloudflareFetch from "@tschk/moonshine-deploy-cloudflare";
import manifest from "./manifest.json" with { type: "json" };
import { modules, renderer } from "./dist/server.js";

type Env = { ASSETS?: { fetch: (request: Request) => Promise<Response> } };

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (promise: Promise<unknown>) => void }) {
    return cloudflareFetch(request, env, ctx, manifest, modules, renderer);
  },
};
`;
    await writeFile(resolve(outDir, "server.ts"), serverEntry);
  },
};

export const cloudflareHarness: HarnessFactory = (fetch, options) => {
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        pathname !== "/"
      ) {
        const res = await tryServeStatic(
          options.staticDir,
          pathname,
          undefined,
          request.method,
        );
        if (res) return res;
      }
      return fetch(request);
    },
  });

  return {
    start: async () => server.url,
    stop: async () => {
      server.stop(true);
    },
  } as Harness;
};
