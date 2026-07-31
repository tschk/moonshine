import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, isAbsolute, resolve } from "node:path";
import { Readable } from "node:stream";
import {
  type DeploymentAdapter,
  type MoonshineManifest,
} from "@tschk/moonshine-framework";
import { isContained, resolveStaticPath } from "@tschk/moonshine-server";
import {
  type Harness,
  type HarnessFactory,
} from "@tschk/moonshine-adapter-conformance";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

function isHopByHopHeader(key: string): boolean {
  return HOP_BY_HOP.has(key.toLowerCase());
}

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i).toLowerCase() : "";
}

async function tryServeNodeStatic(
  staticDir: string,
  pathname: string,
): Promise<Response | null> {
  const filePath = resolveStaticPath(staticDir, pathname);
  if (!filePath) return null;
  let stats;
  try {
    stats = await stat(filePath);
  } catch {
    return null;
  }
  if (!stats.isFile()) return null;
  try {
    if (!isContained(staticDir, filePath)) return null;
  } catch {
    return null;
  }
  const type = MIME[extOf(filePath)] ?? "application/octet-stream";
  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      "content-type": type,
      "content-length": String(stats.size),
      "x-content-type-options": "nosniff",
    },
  });
}

async function sendNodeResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  const headers: Record<string, string> = {};
  for (const [key, value] of response.headers.entries()) {
    if (isHopByHopHeader(key)) continue;
    headers[key] = value;
  }
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const stream = Readable.fromWeb(
    response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );
  stream.on("error", (err) => {
    res.destroy(err);
  });
  stream.pipe(res);
}

export type NodeHandlerOptions = {
  fetch: (request: Request) => Promise<Response>;
  staticDir?: string;
};

export function createNodeHandler(
  options: NodeHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const method = req.method ?? "GET";
    const reqUrl = req.url ?? "/";
    const host = req.headers.host ?? "localhost";
    const requestUrl = new URL(reqUrl, `http://${host}`);
    const pathname = requestUrl.pathname;

    if (
      options.staticDir &&
      (method === "GET" || method === "HEAD") &&
      pathname !== "/"
    ) {
      const staticRes = await tryServeNodeStatic(options.staticDir, pathname);
      if (staticRes) {
        await sendNodeResponse(res, staticRes);
        return;
      }
    }

    const controller = new AbortController();
    let closed = false;
    const onClose = () => {
      if (closed) return;
      closed = true;
      controller.abort();
    };
    req.once("close", onClose);
    res.once("close", onClose);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (isHopByHopHeader(key)) continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }

    const body =
      method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(req);

    const init = {
      method,
      headers,
      body,
      signal: controller.signal,
      duplex: "half",
    } as unknown as RequestInit;
    const request = new Request(requestUrl.href, init);

    let response: Response;
    try {
      response = await options.fetch(request);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
      }
      res.end(String(error));
      return;
    } finally {
      req.off("close", onClose);
      res.off("close", onClose);
    }

    await sendNodeResponse(res, response);
  };
}

export const nodeHarness: HarnessFactory = (fetch, options) => {
  const handler = createNodeHandler({
    fetch,
    staticDir: options.staticDir,
  });
  const server = createServer(handler);

  return {
    start: async () => {
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address() as { port: number } | null;
      const port = address?.port ?? 0;
      return new URL(`http://localhost:${port}/`);
    },
    stop: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
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

export const nodeAdapter: DeploymentAdapter = {
  name: "node",
  runtimes: ["node"],
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
    const entry = `import { createServer } from "node:http";
import { createRequestHandler } from "@tschk/moonshine-server";
import { reactRenderer } from "@tschk/moonshine-react";
import { createNodeHandler } from "@tschk/moonshine-deploy-node";
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
const server = createServer(createNodeHandler({ fetch, staticDir: import.meta.dir + "/public" }));
server.listen(Number(process.env.PORT) || 0, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  console.log("http://localhost:" + port + "/");
});
`;
    await writeFile(resolve(outDir, "server.ts"), entry);
  },
};
