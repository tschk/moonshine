import { readdir } from "node:fs/promises";
import { dirname, basename, join, relative, resolve } from "node:path";
import type { RouteDefinition, RenderMode } from "@tschk/moonshine-framework";
import { mergeRoutes } from "./inherit.js";
import { toPosix } from "./path.js";

export type DiscoverOptions = {
  routesDir: string;
  programmatic?: RouteDefinition[];
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

export async function discoverRoutes(
  options: DiscoverOptions,
): Promise<RouteDefinition[]> {
  const routesDir = resolve(options.routesDir);
  const files: string[] = [];
  for await (const file of walkFiles(routesDir)) {
    files.push(file);
  }

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

    const route: RouteDefinition = {
      id,
      path: routePath,
      file,
      ...(dataFile && { dataFile }),
      ...(mode && { mode }),
    };

    raw.push(route);
  }

  const merged = mergeRoutes(raw, options.programmatic ?? [], routesDir);
  merged.sort(
    (a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id),
  );
  return merged;
}
