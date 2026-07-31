import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { RouteDefinition } from "@tschk/moonshine-framework";
import { createRouteGraph } from "@tschk/moonshine-router";
import { toPosix } from "./path.js";

type SpecialKind = "layout" | "error" | "middleware";

/**
 * Moonshine names co-located specials `+layout.tsx`; the Next App Router names
 * them `layout.tsx`. Only the prefix differs, so one lookup serves both.
 */
export type RouteConvention = "moonshine" | "next-app" | "next-pages";

const specialPrefix: Readonly<Record<RouteConvention, string | null>> = {
  moonshine: "+",
  "next-app": "",
  // The Pages Router has no per-directory specials; `_app` wraps everything.
  "next-pages": null,
};

/**
 * The App Router's `error.tsx` takes `{ error, reset }` and its root
 * `middleware.ts` runs on the edge, and neither matches the moonshine
 * contract, so only layouts are inherited under that convention.
 */
const specialKinds: Readonly<Record<RouteConvention, SpecialKind[]>> = {
  moonshine: ["layout", "error", "middleware"],
  "next-app": ["layout"],
  "next-pages": [],
};

function findSpecial(
  routesDir: string,
  dir: string,
  kind: SpecialKind,
  convention: RouteConvention,
): string | undefined {
  const prefix = specialPrefix[convention];
  if (prefix === null) return undefined;
  if (!specialKinds[convention].includes(kind)) return undefined;
  const base = join(routesDir, dir, `${prefix}${kind}`);
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function applyInheritance(
  routes: RouteDefinition[],
  routesDir: string,
  convention: RouteConvention,
): void {
  const resolvedDir = resolve(routesDir);
  for (const route of routes) {
    if (!route.file) continue;
    const rel = toPosix(relative(resolvedDir, resolve(route.file)));
    const dir = dirname(rel);
    const parts = dir === "." ? [] : dir.split("/").filter(Boolean);
    const ancestors: string[] = [""];
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      ancestors.push(acc);
    }

    const layouts: string[] = [];
    const middleware: string[] = [];
    let errorBoundary: string | undefined;

    for (const ancestor of ancestors) {
      const layout = findSpecial(resolvedDir, ancestor, "layout", convention);
      if (layout) layouts.push(layout);
      const mw = findSpecial(resolvedDir, ancestor, "middleware", convention);
      if (mw) middleware.push(mw);
      const err = findSpecial(resolvedDir, ancestor, "error", convention);
      if (err) errorBoundary = err;
    }

    if (layouts.length) route.layouts = layouts;
    if (middleware.length) route.middleware = middleware;
    if (errorBoundary) route.errorBoundary = errorBoundary;
  }
}

export function mergeRoutes(
  filesystem: RouteDefinition[],
  programmatic: RouteDefinition[] = [],
  routesDir?: string,
  convention: RouteConvention = "moonshine",
): RouteDefinition[] {
  const map = new Map<string, RouteDefinition>();
  for (const route of filesystem) {
    map.set(route.id, route);
  }
  for (const route of programmatic) {
    const existing = map.get(route.id);
    if (existing) {
      map.set(route.id, { ...existing, ...route });
    } else {
      map.set(route.id, route);
    }
  }
  const merged = [...map.values()];
  if (routesDir) applyInheritance(merged, routesDir, convention);
  createRouteGraph(merged);
  return merged;
}
