import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  type DeploymentAdapter,
  type MoonshineManifest,
} from "@tschk/moonshine-framework";
import { tryServeStatic } from "@tschk/moonshine-server";
import {
  type Harness,
  type HarnessFactory,
} from "@tschk/moonshine-adapter-conformance";

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
      pathname !== "/" &&
      !pathname.includes("..")
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
    const assets: MoonshineManifest["assets"] = [];
    for (const asset of manifest.assets) {
      const file = await copyAsset(asset, outDir);
      assets.push({ ...asset, file });
    }
    const builtManifest: MoonshineManifest = { ...manifest, assets };
    await writeFile(
      resolve(outDir, "manifest.json"),
      JSON.stringify(builtManifest, null, 2) + "\n",
    );
    const entry = `import { createRequestHandler } from "@tschk/moonshine-server";
import { reactRenderer } from "@tschk/moonshine-react";
import { createBunServer } from "@tschk/moonshine-deploy-bun";
import manifest from "./manifest.json" with { type: "json" };

const fetch = createRequestHandler({ manifest, renderer: reactRenderer });
createBunServer({ fetch, port: Number(process.env.PORT) || 0 });
`;
    await writeFile(resolve(outDir, "server.ts"), entry);
  },
};
