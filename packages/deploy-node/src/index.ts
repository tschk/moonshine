import { mkdir, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import {
  type DeploymentAdapter,
  type MoonshineManifest,
  type Harness,
  type HarnessFactory,
  copyAsset,
  validateRuntime,
} from "@tschk/moonshine-framework";
import { tryServeStatic } from "@tschk/moonshine-server";

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

async function sendNodeResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of response.headers.entries()) {
    if (isHopByHopHeader(key) || key.toLowerCase() === "set-cookie") continue;
    headers[key] = value;
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
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

const HOST_PATTERN = /^(?:[a-zA-Z0-9._-]+|\[[0-9a-fA-F:.]+\])(?::\d{1,5})?$/;

/**
 * Node hands the Host header through unvalidated, so a client-supplied value
 * can smuggle userinfo, a path, or a query into the base URL and change the
 * origin every downstream URL comparison is made against.
 */
function safeHost(host: string | undefined): string {
  if (!host) return "localhost";
  return HOST_PATTERN.test(host) ? host : "localhost";
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
    const host = safeHost(req.headers.host);
    const requestUrl = new URL(reqUrl, `http://${host}`);
    const pathname = requestUrl.pathname;

    if (
      options.staticDir &&
      (method === "GET" || method === "HEAD") &&
      pathname !== "/"
    ) {
      const staticRes = await tryServeStatic(
        options.staticDir,
        pathname,
        undefined,
        method,
      );
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
    // IncomingMessage also closes after a normal body read; only an
    // incomplete message means the request was interrupted.
    const onRequestClose = () => {
      if (!req.complete) onClose();
    };
    req.once("close", onRequestClose);
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
      req.off("close", onRequestClose);
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

export const nodeAdapter: DeploymentAdapter = {
  name: "node",
  runtimes: ["node"],
  capabilities: ["streaming", "islands", "revalidation"],
  build: async (manifest, outDir) => {
    validateRuntime(nodeAdapter, manifest);
    await mkdir(outDir, { recursive: true });
    const assets = await Promise.all(
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
    const native = manifest.renderer === "native";
    const rendererImport = native
      ? 'import { modules, renderer } from "./dist/server.js";'
      : 'import { modules } from "./dist/server.js";\nimport { reactRenderer as renderer } from "@tschk/moonshine-react";';
    const entry = `import { createServer } from "node:http";
import { createRequestHandler } from "@tschk/moonshine-server";
import { createNodeHandler } from "@tschk/moonshine-deploy-node";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json" with { type: "json" };
${rendererImport}
${manifest.requestContext ? 'import { requestScope } from "./dist/server.js";' : ""}

const artifactDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(artifactDir, "..");
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
  manifest: ${native ? "manifest" : "resolvedManifest"},
  modules,
  renderer,${manifest.requestContext ? "\n  requestScope," : ""}
  staticDir: artifactDir + "/public",
});
export const server = createServer(createNodeHandler({ fetch }));
const envPort = Number(process.env.PORT);
server.listen(Number.isInteger(envPort) && envPort >= 0 && envPort <= 65535 ? envPort : 0, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  console.log("http://localhost:" + port + "/");
});
`;
    const entryPath = resolve(outDir, "server.ts");
    await writeFile(entryPath, entry);
    if (native) {
      const result = await Bun.build({
        entrypoints: [entryPath],
        outdir: outDir,
        target: "node",
        packages: "bundle",
      });
      if (!result.success)
        throw new AggregateError(
          result.logs,
          "Native Node server bundle failed",
        );
    }
  },
};
