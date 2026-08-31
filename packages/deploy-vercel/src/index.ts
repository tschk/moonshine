import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { tryServeStatic } from "@tschk/moonshine-server";
import { reactRenderer, type RenderContext } from "@tschk/moonshine-react";
import type {
  DeploymentAdapter,
  RouteArtifact,
  Harness,
  HarnessFactory,
} from "@tschk/moonshine-framework";
import {
  resolveManifestFiles,
  copyAssets,
  validateRuntime,
  validateCapabilities,
} from "@tschk/moonshine-framework";

type VercelRoute = {
  src: string;
  dest: string;
};

type VercelConfig = {
  version: 3;
  routes: VercelRoute[];
};

function routeToRegex(path: string): string {
  return `^${path
    .replace(/\//g, "\\/")
    .replace(/\*/g, ".*")
    .replace(/:([^/]+?)\?/g, "(?<$1>[^/]*)")
    .replace(/:([^/]+)/g, "(?<$1>[^/]+)")}$`;
}

function staticSlug(path: string, usedSlugs: Set<string>): string {
  if (path === "/") return "index";
  let slug = path.replace(/^\/+/, "").replace(/\//g, "-");
  if (!usedSlugs.has(slug)) {
    usedSlugs.add(slug);
    return slug;
  }
  let i = 1;
  while (usedSlugs.has(`${slug}-${i}`)) i++;
  usedSlugs.add(`${slug}-${i}`);
  return `${slug}-${i}`;
}

async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length });
  const errors: unknown[] = [];
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i]);
      } catch (e) {
        errors.push(e);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  if (errors.length > 0) throw errors[0];
  return results;
}

async function prerenderRoute(route: RouteArtifact): Promise<string> {
  const context: RenderContext = {
    request: new Request(`http://localhost${route.path}`),
    route,
    params: {},
    data: {},
    signal: new AbortController().signal,
  };
  return reactRenderer.prerender(context);
}

export const vercelAdapter: DeploymentAdapter = {
  name: "vercel",
  runtimes: ["node", "vercel-edge"],
  capabilities: ["streaming", "islands", "edge"],
  build: async (manifest, outDir) => {
    validateRuntime(vercelAdapter, manifest);
    validateCapabilities(vercelAdapter, manifest);

    await mkdir(outDir, { recursive: true });
    const projectRoot = resolve(outDir, "..");
    const resolvedManifest = resolveManifestFiles(manifest, projectRoot);

    await writeFile(
      resolve(outDir, "manifest.json"),
      JSON.stringify(resolvedManifest, null, 2) + "\n",
    );
    await copyAssets(manifest.assets, outDir);

    const vercelOutput = resolve(outDir, ".vercel/output");
    const staticDir = resolve(vercelOutput, "static");
    const functionsDir = resolve(vercelOutput, "functions");
    await mkdir(staticDir, { recursive: true });
    await mkdir(functionsDir, { recursive: true });

    const config: VercelConfig = { version: 3, routes: [] };
    const usedSlugs = new Set<string>();

    const routesConfig = await mapConcurrent(
      resolvedManifest.routes,
      async (route) => {
        if (route.mode === "static" && !route.path.includes("*")) {
          const html = await prerenderRoute(route);
          const slug = staticSlug(route.path, usedSlugs);
          await writeFile(resolve(staticDir, `${slug}.html`), html);
          return {
            src: routeToRegex(route.path),
            dest: `/${slug}.html`,
          };
        } else {
          const funcDir = resolve(functionsDir, `${route.id}.func`);
          await mkdir(funcDir, { recursive: true });

          const runtime =
            route.runtime === "vercel-edge" ? "edge" : "nodejs20.x";
          const vcConfig: Record<string, string> = {
            runtime,
            handler: "index.ts",
          };
          if (runtime !== "edge") {
            vcConfig.launcherType = "Nodejs";
          }
          await writeFile(
            resolve(funcDir, ".vc-config.json"),
            JSON.stringify(vcConfig, null, 2) + "\n",
          );

          const functionEntry = `import { createRequestHandler } from "@tschk/moonshine-server";
import { reactRenderer } from "@tschk/moonshine-react";
import manifest from "../../manifest.json" with { type: "json" };

const fetch = createRequestHandler({ manifest, renderer: reactRenderer });

export default { fetch };
`;
          await writeFile(resolve(funcDir, "index.ts"), functionEntry);

          return {
            src: routeToRegex(route.path),
            dest: `/${route.id}`,
          };
        }
      },
      20,
    );
    config.routes.push(...routesConfig);

    await Promise.all(
      resolvedManifest.assets.map(async (asset) => {
        const source = isAbsolute(asset.file)
          ? asset.file
          : resolve(outDir, asset.file);
        const target = resolve(
          staticDir,
          (asset.path ?? asset.file).replace(/^\/+/, ""),
        );
        await mkdir(dirname(target), { recursive: true });
        if (source !== target) {
          await copyFile(source, target);
        }
      }),
    );

    await writeFile(
      resolve(vercelOutput, "manifest.json"),
      JSON.stringify(resolvedManifest, null, 2) + "\n",
    );
    await writeFile(
      resolve(vercelOutput, "config.json"),
      JSON.stringify(config, null, 2) + "\n",
    );

    const serverEntry = `import { createRequestHandler } from "@tschk/moonshine-server";
import { reactRenderer } from "@tschk/moonshine-react";
import { join } from "node:path";
import manifest from "./manifest.json" with { type: "json" };

const fetch = createRequestHandler({
  manifest,
  renderer: reactRenderer,
  staticDir: join(import.meta.dir, ".vercel/output/static"),
});

Bun.serve({ port: Number(process.env.PORT) || 0, fetch });
`;
    await writeFile(resolve(outDir, "server.ts"), serverEntry);
  },
};

export const vercelHarness: HarnessFactory = (fetch, options) => {
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
