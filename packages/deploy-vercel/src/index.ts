import { copyFile, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tryServeStatic } from "@tschk/moonshine-server";

import {
  type DeploymentAdapter,
  type MoonshineManifest,
  type Harness,
  type HarnessFactory,
  copyAssets,
  validateRuntime,
  validateCapabilities,
} from "@tschk/moonshine-framework";

type VercelRoute =
  | { handle: "filesystem" }
  | { src: string; dest: string; headers?: Record<string, string> };

type VercelConfig = {
  version: 3;
  routes: VercelRoute[];
};

function routeToRegex(path: string): string {
  // A splat also matches its bare prefix (`/docs/*` matches `/docs`), as the
  // router does. The suffix is appended last so the parameter rewrite cannot
  // touch the `:` in its `(?:` group.
  const splat = /\/\*[^/]*$/;
  const pattern = path
    .replace(splat, "")
    .replace(/\//g, "\\/")
    .replace(/:([^/]+?)\?/g, "(?<$1>[^/]*)")
    .replace(/:([^/]+)/g, "(?<$1>[^/]+)");
  return `^${pattern}${splat.test(path) ? "(?:\\/.*)?" : ""}$`;
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
    // Project-relative paths: the bundled module map is keyed by them.
    await writeFile(
      resolve(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );

    const vercelOutput = resolve(outDir, ".vercel/output");
    const staticDir = resolve(vercelOutput, "static");
    await mkdir(staticDir, { recursive: true });
    const routes: VercelRoute[] = [{ handle: "filesystem" }];
    if (manifest.routes.length) {
      routes.push(...(await buildFunctions(manifest, outDir, staticDir)));
    }
    await copyPublicAssets(manifest, outDir, staticDir);
    await writeFile(
      resolve(vercelOutput, "config.json"),
      JSON.stringify({ version: 3, routes } satisfies VercelConfig, null, 2) +
        "\n",
    );
  },
};

const own = (specifier: string) =>
  JSON.stringify(fileURLToPath(import.meta.resolve(specifier)));

/**
 * Bundles the app into at most two self-contained functions — one Node, one
 * Edge — and prerenders static routes by requesting them from the Node bundle,
 * so the HTML carries loader data exactly as a live request would.
 */
async function buildFunctions(
  manifest: MoonshineManifest,
  outDir: string,
  staticDir: string,
): Promise<VercelRoute[]> {
  const functionsDir = resolve(outDir, ".vercel/output/functions");
  const appImports = `import { createRequestHandler } from ${own("@tschk/moonshine-server")};
import { reactRenderer as renderer, registerRouteModules } from "@tschk/moonshine-react";
import { modules } from "./dist/server.js";
import manifest from "./manifest.json" with { type: "json" };
registerRouteModules(modules);
export const fetch = createRequestHandler({ manifest, modules, renderer });
`;
  const define = { "process.env.NODE_ENV": JSON.stringify("production") };
  const nodeDir = resolve(functionsDir, "moonshine.func");
  const nodeEntry = resolve(outDir, "vercel-node.ts");
  await writeFile(
    nodeEntry,
    `${appImports}import { createNodeHandler } from ${own("@tschk/moonshine-deploy-node")};
export default createNodeHandler({ fetch });
`,
  );
  const nodeBuild = await Bun.build({
    entrypoints: [nodeEntry],
    outdir: nodeDir,
    naming: "index.mjs",
    target: "node",
    packages: "bundle",
    define,
  });
  if (!nodeBuild.success)
    throw new AggregateError(
      nodeBuild.logs,
      "Vercel Node function bundle failed",
    );

  const routes: VercelRoute[] = [];
  const usedSlugs = new Set<string>();
  const prerendered = new Set<string>();
  const app = (await import(
    `${pathToFileURL(resolve(nodeDir, "index.mjs")).href}?${Date.now()}`
  )) as { fetch: (request: Request) => Promise<Response> };
  for (const route of manifest.routes) {
    if (
      route.mode !== "static" ||
      route.path.includes("*") ||
      route.path.includes(":")
    )
      continue;
    const response = await app.fetch(
      new Request(new URL(route.path, "http://localhost")),
    );
    if (response.status !== 200)
      throw new Error(
        `Prerendering static route "${route.path}" returned ${response.status}`,
      );
    const slug = staticSlug(route.path, usedSlugs);
    await writeFile(resolve(staticDir, `${slug}.html`), await response.text());
    routes.push({
      src: routeToRegex(route.path),
      dest: `/${slug}.html`,
      ...(route.headers && { headers: route.headers }),
    });
    prerendered.add(route.id);
  }

  const live = manifest.routes.filter((route) => !prerendered.has(route.id));
  const edge = live.filter((route) => route.runtime === "vercel-edge");
  const node = live.filter((route) => route.runtime !== "vercel-edge");
  if (edge.length) {
    const edgeEntry = resolve(outDir, "vercel-edge.ts");
    await writeFile(
      edgeEntry,
      `${appImports}export default (request) => fetch(request);
`,
    );
    const edgeDir = resolve(functionsDir, "moonshine-edge.func");
    const edgeBuild = await Bun.build({
      entrypoints: [edgeEntry],
      outdir: edgeDir,
      naming: "index.js",
      target: "browser",
      packages: "bundle",
      define,
    });
    if (!edgeBuild.success)
      throw new AggregateError(
        edgeBuild.logs,
        "Vercel Edge function bundle failed",
      );
    await writeFile(
      resolve(edgeDir, ".vc-config.json"),
      JSON.stringify({ runtime: "edge", entrypoint: "index.js" }, null, 2) +
        "\n",
    );
    for (const route of edge)
      routes.push({ src: routeToRegex(route.path), dest: "/moonshine-edge" });
  }
  if (node.length || !edge.length) {
    await writeFile(
      resolve(nodeDir, ".vc-config.json"),
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
    // Everything else, including unmatched paths, reaches the app so its own
    // 404 handling applies.
    routes.push({ src: "/.*", dest: "/moonshine" });
  } else {
    await rm(nodeDir, { recursive: true, force: true });
    routes.push({ src: "/.*", dest: "/moonshine-edge" });
  }
  return routes;
}

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
