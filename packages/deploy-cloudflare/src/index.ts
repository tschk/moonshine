import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  createRequestHandler,
  tryServeStatic,
  type RouteModule,
} from "@tschk/moonshine-server";
import { matchRoutes, createRouteGraph } from "@tschk/moonshine-router";
import { reactRenderer, registerRouteModules } from "@tschk/moonshine-react";
import type {
  DeploymentAdapter,
  MoonshineManifest,
  Harness,
  HarnessFactory,
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
  registerRouteModules(modules);
  const handler = createRequestHandler({
    manifest,
    modules,
    renderer: reactRenderer,
  });
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

function resolveManifestFiles(
  manifest: MoonshineManifest,
  projectRoot: string,
): MoonshineManifest {
  return {
    ...manifest,
    routes: manifest.routes.map((route) => ({
      ...route,
      file: isAbsolute(route.file)
        ? route.file
        : resolve(projectRoot, route.file),
      ...(route.dataFile && {
        dataFile: isAbsolute(route.dataFile)
          ? route.dataFile
          : resolve(projectRoot, route.dataFile),
      }),
      ...(route.layouts && {
        layouts: route.layouts.map((layout) =>
          isAbsolute(layout) ? layout : resolve(projectRoot, layout),
        ),
      }),
      ...(route.middleware && {
        middleware: route.middleware.map((middleware) =>
          isAbsolute(middleware)
            ? middleware
            : resolve(projectRoot, middleware),
        ),
      }),
      ...(route.errorBoundary && {
        errorBoundary: isAbsolute(route.errorBoundary)
          ? route.errorBoundary
          : resolve(projectRoot, route.errorBoundary),
      }),
    })),
  };
}

async function copyAssets(
  assets: MoonshineManifest["assets"],
  outDir: string,
): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      const source = isAbsolute(asset.file)
        ? asset.file
        : resolve(outDir, asset.file);
      const target = resolve(
        outDir,
        (asset.path ?? asset.file).replace(/^\/+/, ""),
      );
      await mkdir(dirname(target), { recursive: true });
      if (source !== target) {
        await copyFile(source, target);
      }
    }),
  );
}

function validateRuntime(
  adapter: DeploymentAdapter,
  manifest: MoonshineManifest,
): void {
  const errors: string[] = [];
  for (const route of manifest.routes) {
    if (!adapter.runtimes.includes(route.runtime)) {
      errors.push(
        `${adapter.name} adapter does not support route "${route.path}" with runtime "${route.runtime}"; supported runtimes: ${adapter.runtimes.join(", ")}`,
      );
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

function validateCapabilities(
  adapter: DeploymentAdapter,
  manifest: MoonshineManifest,
): void {
  for (const capability of manifest.capabilities) {
    if (!adapter.capabilities.includes(capability)) {
      throw new Error(
        `${adapter.name} adapter does not support capability "${capability}"; supported capabilities: ${adapter.capabilities.join(", ")}`,
      );
    }
  }
}

export const cloudflareAdapter: DeploymentAdapter = {
  name: "cloudflare",
  runtimes: ["cloudflare"],
  capabilities: ["streaming", "islands", "edge", "revalidation"],
  build: async (manifest, outDir) => {
    validateRuntime(cloudflareAdapter, manifest);
    validateCapabilities(cloudflareAdapter, manifest);

    await mkdir(outDir, { recursive: true });
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
import { modules } from "./dist/server.js";

type Env = { ASSETS?: { fetch: (request: Request) => Promise<Response> } };

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (promise: Promise<unknown>) => void }) {
    return cloudflareFetch(request, env, ctx, manifest, modules);
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
        const res = await tryServeStatic(options.staticDir, pathname);
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
