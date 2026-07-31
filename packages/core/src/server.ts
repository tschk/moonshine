/**
 * Light server-entry helpers.
 *
 * Thin page-module table on top of Bun.serve (or any fetch handler).
 * Greenfield HTTP path — no metaframework required.
 */

import { join, normalize, resolve, sep } from "node:path";

export type MoonshineRequest = {
  url: string;
  method: string;
  headers: Headers;
  pathname: string;
  searchParams: URLSearchParams;
};

export type MoonshinePageModule = {
  /** Optional data loader hook. */
  getConfig?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Render body for the path. May return a string (HTML), Response, or JSON-able. */
  render: (req: MoonshineRequest) => Promise<unknown> | unknown;
};

export type MoonshineServerOptions = {
  /** Map of pathname → page module (file-ish routing table). */
  pages: Record<string, MoonshinePageModule>;
  /** Called when no page or static file matches. */
  notFound?: (req: MoonshineRequest) => Promise<Response> | Response;
  /** Port for `Bun.serve` helper (default 3000). */
  port?: number;
  /**
   * Directory of static assets (CSS/JS/images). Checked before pages.
   * Path traversal outside the directory is rejected.
   */
  staticDir?: string;
};

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

/** Normalize a Fetch API Request into a Moonshine request bag. */
export function toMoonshineRequest(request: Request): MoonshineRequest {
  const url = new URL(request.url);
  return {
    url: request.url,
    method: request.method,
    headers: request.headers,
    pathname: url.pathname.replace(/\/+$/, "") || "/",
    searchParams: url.searchParams,
  };
}

/**
 * Resolve a page module for a pathname.
 * Supports exact keys and a trailing `/*` splat prefix.
 */
export function resolvePage(
  pages: Record<string, MoonshinePageModule>,
  pathname: string,
): MoonshinePageModule | null {
  if (pages[pathname]) return pages[pathname]!;
  if (pages["/"] && pathname === "") return pages["/"]!;

  let best: { key: string; mod: MoonshinePageModule } | null = null;
  for (const [key, mod] of Object.entries(pages)) {
    if (!key.endsWith("/*")) continue;
    const prefix = key.slice(0, -1);
    const base = prefix.endsWith("/") ? prefix.slice(0, -1) || "/" : prefix;
    if (pathname === base || pathname.startsWith(base === "/" ? "/" : `${base}/`)) {
      if (!best || key.length > best.key.length) best = { key, mod };
    }
  }
  return best?.mod ?? null;
}

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i).toLowerCase() : "";
}

/**
 * Resolve a safe file path under `staticDir` for a URL pathname.
 * Returns null on traversal / missing path.
 */
export function resolveStaticPath(
  staticDir: string,
  pathname: string,
): string | null {
  const root = resolve(staticDir);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) return null;
  const candidate = normalize(join(root, rel));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

/** Try to serve a static file when running under Bun. */
export async function tryServeStatic(
  staticDir: string,
  pathname: string,
): Promise<Response | null> {
  if (typeof Bun === "undefined") return null;
  const filePath = resolveStaticPath(staticDir, pathname);
  if (!filePath) return null;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const type = MIME[extOf(filePath)] ?? (file.type || "application/octet-stream");
  return new Response(file, {
    headers: { "content-type": type },
  });
}

/** Handle one request against static dir + pages table. */
export async function handleMoonshineRequest(
  request: Request,
  options: Pick<MoonshineServerOptions, "pages" | "notFound" | "staticDir">,
): Promise<Response> {
  const req = toMoonshineRequest(request);

  if (
    options.staticDir &&
    req.method === "GET" &&
    req.pathname !== "/" &&
    !req.pathname.includes("..")
  ) {
    const staticRes = await tryServeStatic(options.staticDir, req.pathname);
    if (staticRes) return staticRes;
  }

  const page = resolvePage(options.pages, req.pathname);

  if (!page) {
    if (options.notFound) return options.notFound(req);
    return new Response("Not Found", { status: 404 });
  }

  const body = await page.render(req);
  if (body instanceof Response) return body;
  if (typeof body === "string") {
    return new Response(body, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export type MoonshineServer = {
  fetch: (request: Request) => Promise<Response>;
  /** Start Bun.serve when running under Bun; returns the server handle. */
  listen: () => unknown;
  port: number;
};

/**
 * Create a Bun-first server entry from a pages map (+ optional static dir).
 *
 * ```ts
 * const server = createMoonshineServer({
 *   staticDir: "./public",
 *   pages: {
 *     "/": { render: () => "<h1>Home</h1><script type=module src=/client.js></script>" },
 *   },
 * });
 * server.listen();
 * ```
 */
export function createMoonshineServer(options: MoonshineServerOptions): MoonshineServer {
  const port = options.port ?? 3000;

  const fetch = (request: Request) => handleMoonshineRequest(request, options);

  return {
    fetch,
    port,
    listen() {
      if (typeof Bun === "undefined") {
        throw new Error("createMoonshineServer.listen() requires Bun");
      }
      return Bun.serve({
        port,
        fetch,
      });
    },
  };
}

/** Define a page module with inference-friendly typing. */
export function definePage(page: MoonshinePageModule): MoonshinePageModule {
  return page;
}
