import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { RouteDefinition } from "@tschk/moonshine-framework";
import { createRouteGraph } from "@tschk/moonshine-router";
import { toPosix } from "./path.js";

type SpecialKind = "layout" | "error" | "middleware";

function findSpecial(
  routesDir: string,
  dir: string,
  kind: SpecialKind,
): string | undefined {
  const base = join(routesDir, dir, `+${kind}`);
  for (const ext of [".tsx", ".ts"]) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function applyInheritance(routes: RouteDefinition[], routesDir: string): void {
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
      const layout = findSpecial(resolvedDir, ancestor, "layout");
      if (layout) layouts.push(layout);
      const mw = findSpecial(resolvedDir, ancestor, "middleware");
      if (mw) middleware.push(mw);
      const err = findSpecial(resolvedDir, ancestor, "error");
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
  if (routesDir) applyInheritance(merged, routesDir);
  createRouteGraph(merged);
  return merged;
}
