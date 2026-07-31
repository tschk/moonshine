import { join, normalize, resolve, sep } from "node:path";

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
