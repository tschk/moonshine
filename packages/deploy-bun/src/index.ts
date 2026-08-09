import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  type DeploymentAdapter,
  type MoonshineManifest,
  type Harness,
  type HarnessFactory,
} from "@tschk/moonshine-framework";
import { tryServeStatic } from "@tschk/moonshine-server";

export type BunServerOptions = {
  fetch: (request: Request) => Promise<Response>;
  port?: number;
  staticDir?: string;
};

export type BunServer = {
  url: URL;
  port: number;
  stop: (force?: boolean) => Promise<void>;
};

export function createBunServer(options: BunServerOptions): BunServer {
  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (
      options.staticDir &&
      (request.method === "GET" || request.method === "HEAD") &&
      pathname !== "/"
    ) {
      const res = await tryServeStatic(options.staticDir, pathname);
      if (res) return res;
    }
    return options.fetch(request);
  };

  return Bun.serve({
    port: options.port ?? 0,
    fetch,
  }) as BunServer;
}

export const bunHarness: HarnessFactory = (fetch, options) => {
  const server = createBunServer({
    fetch,
    port: 0,
    staticDir: options.staticDir,
  });

  return {
    start: async () => server.url,
    stop: async () => {
      await server.stop(true);
    },
  } as Harness;
};

async function copyAsset(
  asset: MoonshineManifest["assets"][number],
  outDir: string,
): Promise<string> {
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
  return (asset.path ?? asset.file).replace(/^\/+/, "");
}

export const bunAdapter: DeploymentAdapter = {
  name: "bun",
  runtimes: ["bun"],
  capabilities: ["streaming", "islands", "revalidation"],
  build: async (manifest, outDir) => {
    await mkdir(outDir, { recursive: true });
    const assets: MoonshineManifest["assets"] = await Promise.all(
      manifest.assets.map(async (asset) => {
        const file = await copyAsset(asset, outDir);
        return { ...asset, file };
      }),
    );
    const builtManifest: MoonshineManifest = { ...manifest, assets };
    await writeFile(
      resolve(outDir, "manifest.json"),
      JSON.stringify(builtManifest, null, 2) + "\n",
    );
    const entry = `import { createRequestHandler } from "@tschk/moonshine-server";
import { reactRenderer } from "@tschk/moonshine-react";
import { createBunServer } from "@tschk/moonshine-deploy-bun";
import { resolve } from "node:path";
import manifest from "./manifest.json" with { type: "json" };
import { modules } from "./dist/server.js";

const projectDir = resolve(import.meta.dir, "..");
const abs = (p) => (p ? resolve(projectDir, p) : undefined);
const resolvedManifest = {
  ...manifest,
  routes: manifest.routes.map((r) => ({
    ...r,
    file: resolve(projectDir, r.file),
    dataFile: abs(r.dataFile),
    layouts: r.layouts?.map(abs).filter(Boolean),
    middleware: r.middleware?.map(abs).filter(Boolean),
    errorBoundary: abs(r.errorBoundary),
  })),
};

const fetch = createRequestHandler({
  manifest: resolvedManifest,
  modules,
  renderer: reactRenderer,
  staticDir: import.meta.dir + "/public",
});
const server = createBunServer({
  fetch,
  port: Number(process.env.PORT) || 0,
  staticDir: import.meta.dir + "/public",
});
console.log(server.url.origin);
`;
    await writeFile(resolve(outDir, "server.ts"), entry);
  },
};
