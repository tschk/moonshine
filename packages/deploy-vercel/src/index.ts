import { copyFile, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tryServeStatic } from "@tschk/moonshine-server";

import {
  type DeploymentAdapter,
  type MoonshineManifest,
  type RenderContext,
  type RouteArtifact,
  type Harness,
  type HarnessFactory,
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
  const results: R[] = Array.from({ length: items.length });
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
  const { reactRenderer } = await import("@tschk/moonshine-react");
  return reactRenderer.prerender(context);
}

function validateAssetPath(path: string): void {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* Literal percent filenames are valid. */
  }
  for (const value of [path, decoded]) {
    if (
      !value.startsWith("/") ||
      value.includes("\\") ||
      Array.from(value).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      value.split("/").includes("..")
    )
      throw new Error(`Invalid public asset path: ${path}`);
  }
}

/** Native output exposes only public files; legacy registries exclude server bundles. */
async function copyPublicAssets(
  manifest: MoonshineManifest,
  outDir: string,
  staticDir: string,
) {
  await Promise.all(
    manifest.assets.map(async (asset) => {
      const source = await realpath(
        isAbsolute(asset.file) ? asset.file : resolve(outDir, asset.file),
      );
      const directory = resolve(
        outDir,
        manifest.renderer === "native" ? "public" : "dist",
      );
      const canonicalDirectory = await realpath(directory).catch(
        () => directory,
      );
      const sourcePath = relative(canonicalDirectory, source);
      const withinDirectory =
        sourcePath !== ".." &&
        !sourcePath.startsWith(`..${sep}`) &&
        !isAbsolute(sourcePath);
      if (manifest.renderer === "native" ? !withinDirectory : withinDirectory)
        return;
      if (manifest.renderer !== "native" && manifest.entries.server) {
        const entry = resolve(outDir, manifest.entries.server);
        if (source === (await realpath(entry).catch(() => entry))) return;
      }
      validateAssetPath(asset.path);
      const publicDirectory = resolve(outDir, "public");
      const canonicalPublic = await realpath(publicDirectory).catch(
        () => publicDirectory,
      );
      const publicPath = relative(canonicalPublic, source);
      const withinPublic =
        publicPath !== ".." &&
        !publicPath.startsWith(`..${sep}`) &&
        !isAbsolute(publicPath);
      const canonicalUrl =
        "/" + publicPath.split(sep).map(encodeURIComponent).join("/");
      const preservePublicFilename =
        withinPublic &&
        (manifest.renderer === "native" || asset.path === canonicalUrl);
      const target = resolve(
        staticDir,
        preservePublicFilename ? publicPath : asset.path.replace(/^\/+/, ""),
      );
      const targetPath = relative(staticDir, target);
      if (
        !targetPath ||
        targetPath === ".." ||
        targetPath.startsWith(`..${sep}`) ||
        isAbsolute(targetPath)
      )
        throw new Error(`Invalid public asset path: ${asset.path}`);
      await mkdir(dirname(target), { recursive: true });
      if (source !== target) await copyFile(source, target);
    }),
  );
}

async function buildNativeFunction(
  manifest: MoonshineManifest,
  outDir: string,
) {
  const output = resolve(outDir, ".vercel/output");
  const funcDir = resolve(output, "functions/moonshine.func");
  const staticDir = resolve(output, "static");
  await mkdir(funcDir, { recursive: true });
  await mkdir(staticDir, { recursive: true });
  await writeFile(
    resolve(outDir, "manifest.json"),
    JSON.stringify(manifest) + "\n",
  );
  await copyPublicAssets(manifest, outDir, staticDir);
  const entryPath = resolve(outDir, "vercel-native.ts");
  await writeFile(
    entryPath,
    `import { createRequestHandler } from "@tschk/moonshine-server";
import { createNodeHandler } from ${JSON.stringify(fileURLToPath(import.meta.resolve("@tschk/moonshine-deploy-node")))};
import { modules, renderer } from "./dist/server.js";
import manifest from "./manifest.json" with { type: "json" };
const fetch = createRequestHandler({ manifest, modules, renderer });
export default createNodeHandler({ fetch });
`,
  );
  const result = await Bun.build({
    entrypoints: [entryPath],
    outdir: funcDir,
    naming: "index.mjs",
    target: "node",
    packages: "bundle",
  });
  if (!result.success)
    throw new AggregateError(
      result.logs,
      "Native Vercel Node function bundle failed",
    );
  await writeFile(
    resolve(funcDir, ".vc-config.json"),
    JSON.stringify(
      {
        runtime: "nodejs22.x",
        handler: "index.mjs",
        launcherType: "Nodejs",
        supportsResponseStreaming: true,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    resolve(output, "config.json"),
    JSON.stringify(
      {
        version: 3,
        routes: [{ handle: "filesystem" }, { src: "/.*", dest: "/moonshine" }],
      },
      null,
      2,
    ) + "\n",
  );
}

export const vercelAdapter: DeploymentAdapter = {
  name: "vercel",
  runtimes: ["node", "vercel-edge"],
  capabilities: ["streaming", "islands", "edge"],
  build: async (manifest, outDir) => {
    if (manifest.renderer === "native") {
      if (manifest.routes.some((route) => route.runtime !== "node"))
        throw new Error("Native Vercel supports only the Node runtime");
      if (manifest.requestContext)
        throw new Error("Native Vercel request context is not supported");
      if (manifest.routes.some((route) => route.mode === "island"))
        throw new Error("Native island hydration is not implemented");
      if (
        manifest.routes.some((route) => route.cache) ||
        manifest.capabilities.includes("revalidation")
      )
        throw new Error(
          "Native Vercel caching/revalidation is not implemented",
        );
    }
    validateRuntime(vercelAdapter, manifest);
    validateCapabilities(vercelAdapter, manifest);

    await mkdir(outDir, { recursive: true });
    await rm(resolve(outDir, ".vercel/output"), {
      recursive: true,
      force: true,
    });
    if (manifest.renderer === "native") {
      await buildNativeFunction(manifest, outDir);
      return;
    }
    for (const asset of manifest.assets) validateAssetPath(asset.path);
    await copyAssets(manifest.assets, outDir);
    const projectRoot = resolve(outDir, "..");
    const resolvedManifest = resolveManifestFiles(manifest, projectRoot);

    await writeFile(
      resolve(outDir, "manifest.json"),
      JSON.stringify(resolvedManifest, null, 2) + "\n",
    );

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
        if (
          route.mode === "static" &&
          !route.path.includes("*") &&
          !route.path.includes(":")
        ) {
          // Allocate the output slug before awaiting so concurrent workers
          // cannot race on `usedSlugs`.
          const slug = staticSlug(route.path, usedSlugs);
          const html = await prerenderRoute(route);
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

    await copyPublicAssets(resolvedManifest, outDir, staticDir);

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

const envPort = Number(process.env.PORT);
Bun.serve({ port: Number.isInteger(envPort) && envPort >= 0 && envPort <= 65535 ? envPort : 0, fetch });
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
