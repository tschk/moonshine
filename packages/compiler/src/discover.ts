import { readdir } from "node:fs/promises";
import { dirname, basename, join, relative, resolve } from "node:path";
import type { RouteDefinition, RenderMode } from "@tschk/moonshine-framework";
import { mergeRoutes, type RouteConvention } from "./inherit.js";
import { toPosix } from "./path.js";

export type { RouteConvention } from "./inherit.js";

export type DiscoverOptions = {
  routesDir: string;
  programmatic?: RouteDefinition[];
  /**
   * File-system routing dialect. `moonshine` is the native `src/routes` layout;
   * the two `next-*` values read an adopted Next app in place.
   */
  convention?: RouteConvention;
};

export function segmentToPattern(segment: string): string {
  if (/^\[\.\.\.[^\]]*\]$/.test(segment)) return `*${segment.slice(4, -1)}`;
  if (/^\[\[[^\]]+\]\]$/.test(segment)) return `:${segment.slice(2, -2)}?`;
  if (/^\[[^\]]+\]$/.test(segment)) return `:${segment.slice(1, -1)}`;
  return segment;
}

type FileSuffix = "server" | "client" | undefined;

function parseRouteFile(
  name: string,
): { base: string; suffix: FileSuffix } | null {
  const server = /^(.+)\.server\.(ts|tsx)$/.exec(name);
  if (server) return { base: server[1]!, suffix: "server" };
  const client = /^(.+)\.client\.(ts|tsx)$/.exec(name);
  if (client) return { base: client[1]!, suffix: "client" };
  const route = /^(.+)\.(ts|tsx)$/.exec(name);
  if (route) return { base: route[1]!, suffix: undefined };
  return null;
}

function isDataFile(name: string): boolean {
  return /\.data\.(ts|tsx)$/.test(name);
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

const ROUTE_EXT = /\.(tsx?|jsx?|mjs)$/;

/** Segments the App Router strips from the URL, or refuses to route at all. */
function isRouteGroup(segment: string): boolean {
  return /^\([^)]*\)$/.test(segment);
}

function isPrivateSegment(segment: string): boolean {
  return segment.startsWith("_") || segment.startsWith("@");
}

/** Directory chain of an App Router file, as URL pattern plus a stable id. */
function appRouterPath(dir: string): { path: string; id: string } | null {
  const parts = dir === "." ? [] : dir.split("/").filter(Boolean);
  const pattern: string[] = [];
  for (const part of parts) {
    if (isPrivateSegment(part)) return null;
    if (isRouteGroup(part)) continue;
    pattern.push(segmentToPattern(part));
  }
  return {
    path: pattern.length ? `/${pattern.join("/")}` : "/",
    id: parts.length ? parts.join("/") : "index",
  };
}

/**
 * `app/**\/page.tsx` and `app/**\/route.ts`. Every other App Router special
 * (`layout`, `loading`, `template`, `not-found`, `error`, `default`) is either
 * picked up by layout inheritance or has no moonshine equivalent.
 */
function discoverNextApp(
  files: string[],
  routesDir: string,
): RouteDefinition[] {
  const raw: RouteDefinition[] = [];
  for (const file of files) {
    const rel = toPosix(relative(routesDir, file));
    const name = basename(rel);
    if (!ROUTE_EXT.test(name)) continue;
    const base = name.replace(ROUTE_EXT, "");
    if (base !== "page" && base !== "route") continue;

    const located = appRouterPath(dirname(rel));
    if (!located) continue;

    const mode: RenderMode | undefined = base === "route" ? "api" : undefined;
    raw.push({
      id: base === "route" ? `${located.id}#route` : located.id,
      path: located.path,
      file,
      ...(mode && { mode }),
    });
  }
  return raw;
}

/** Files the Pages Router treats as framework hooks rather than routes. */
const PAGES_RESERVED = new Set([
  "_app",
  "_document",
  "_error",
  "middleware",
  "_middleware",
]);

/** `pages/**\/*.tsx`, with `pages/api/**` mapped onto moonshine's api mode. */
function discoverNextPages(
  files: string[],
  routesDir: string,
): RouteDefinition[] {
  const raw: RouteDefinition[] = [];
  for (const file of files) {
    const rel = toPosix(relative(routesDir, file));
    const name = basename(rel);
    if (!ROUTE_EXT.test(name)) continue;
    if (/\.(test|spec|d)\.[jt]sx?$/.test(name)) continue;
    const base = name.replace(ROUTE_EXT, "");
    if (PAGES_RESERVED.has(base)) continue;

    const dir = dirname(rel);
    const parts = dir === "." ? [] : dir.split("/").filter(Boolean);
    if (parts.some(isPrivateSegment)) continue;

    const segments = parts.map(segmentToPattern);
    if (base !== "index") segments.push(segmentToPattern(base));
    const path = segments.length ? `/${segments.join("/")}` : "/";
    const mode: RenderMode | undefined = parts[0] === "api" ? "api" : undefined;

    raw.push({
      id: dir === "." ? base : `${dir}/${base}`,
      path,
      file,
      ...(mode && { mode }),
    });
  }
  return raw;
}

function discoverMoonshine(
  files: string[],
  routesDir: string,
): RouteDefinition[] {
  const fileSet = new Set(files);
  const raw: RouteDefinition[] = [];

  for (const file of files) {
    const rel = toPosix(relative(routesDir, file));
    const dir = dirname(rel);
    const name = basename(rel);

    if (isDataFile(name)) continue;
    if (name.startsWith("+")) continue;

    const parsed = parseRouteFile(name);
    if (!parsed) continue;

    const { base, suffix } = parsed;
    const id = dir === "." ? base : `${dir}/${base}`;
    const dirParts = dir === "." ? [] : dir.split("/").filter(Boolean);
    const dirPattern = dirParts.map(segmentToPattern).join("/");
    const basePattern = base === "index" ? "" : segmentToPattern(base);
    const routePath =
      dirPattern || basePattern
        ? `/${[dirPattern, basePattern].filter(Boolean).join("/")}`
        : "/";

    const dataFile = (() => {
      const parent = dirname(file);
      for (const ext of [".data.ts", ".data.tsx"]) {
        const candidate = join(parent, `${base}${ext}`);
        if (fileSet.has(candidate)) return candidate;
      }
      return undefined;
    })();

    const mode: RenderMode | undefined =
      suffix === "server" ? "api" : undefined;

    raw.push({
      id,
      path: routePath,
      file,
      ...(dataFile && { dataFile }),
      ...(mode && { mode }),
    });
  }

  return raw;
}

export async function discoverRoutes(
  options: DiscoverOptions,
): Promise<RouteDefinition[]> {
  const routesDir = resolve(options.routesDir);
  const convention = options.convention ?? "moonshine";
  const files: string[] = [];
  for await (const file of walkFiles(routesDir)) {
    files.push(file);
  }

  const raw =
    convention === "next-app"
      ? discoverNextApp(files, routesDir)
      : convention === "next-pages"
        ? discoverNextPages(files, routesDir)
        : discoverMoonshine(files, routesDir);

  const merged = mergeRoutes(
    raw,
    options.programmatic ?? [],
    routesDir,
    convention,
  );
  merged.sort(
    (a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id),
  );
  return merged;
}
