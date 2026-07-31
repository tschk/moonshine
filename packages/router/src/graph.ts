import { type RouteDefinition } from "@tschk/moonshine-framework";
import { compilePattern, type CompiledPattern } from "./pattern.js";

export type RouteGraph<T = RouteDefinition> = {
  routes: CompiledRoute<T>[];
};

type CompiledRoute<T> = {
  route: T;
  compiled: CompiledPattern;
};

export function createRouteGraph<T extends RouteDefinition>(
  routes: T[],
): RouteGraph<T> {
  const seen = new Map<string, { id: string; normalized: string }>();
  const compiled: CompiledRoute<T>[] = [];

  for (const route of routes) {
    const compiledPattern = compilePattern(route.path);
    const key = `${compiledPattern.normalized}|${compiledPattern.precedence.join(",")}`;
    const existing = seen.get(key);
    if (existing) {
      throw new Error(
        `Ambiguous routes "${existing.id}" and "${route.id}" both match ${existing.normalized}`,
      );
    }
    seen.set(key, { id: route.id, normalized: compiledPattern.normalized });
    compiled.push({ route, compiled: compiledPattern });
  }

  return { routes: compiled };
}

const MISSING = 4;

function compareMatches(
  a: { score: number[] },
  b: { score: number[] },
): number {
  const max = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < max; i++) {
    const av = i < a.score.length ? a.score[i] : MISSING;
    const bv = i < b.score.length ? b.score[i] : MISSING;
    if (av > bv) return -1;
    if (av < bv) return 1;
  }
  return 0;
}

/**
 * First path segment, or null when it is absent or percent-encoded. Callers use
 * it to skip routes that begin with a different literal segment; decoding is
 * the identity for segments without `%`, so the comparison is exact.
 */
function firstSegment(pathname: string): string | null {
  let start = 0;
  while (start < pathname.length && pathname.charCodeAt(start) === 47) start++;
  if (start >= pathname.length) return null;
  let end = pathname.indexOf("/", start);
  if (end === -1) end = pathname.length;
  const part = pathname.slice(start, end);
  return part.includes("%") ? null : part;
}

export type RouteMatch<T = RouteDefinition> = {
  route: T;
  path: string;
  pattern: string;
  params: Record<string, string>;
};

export function matchRoutes<T extends RouteDefinition>(
  graph: RouteGraph<T>,
  pathname: string,
): RouteMatch<T> | null {
  const first = firstSegment(pathname);
  let best: {
    route: T;
    pattern: string;
    params: Record<string, string>;
    score: number[];
  } | null = null;

  for (const { route, compiled } of graph.routes) {
    if (first !== null) {
      const head = compiled.segments[0];
      if (head && head.kind === "static" && head.value !== first) continue;
    }
    const m = compiled.match(pathname);
    if (!m) continue;
    const candidate = {
      route,
      pattern: compiled.pattern,
      params: m.params,
      score: m.score,
    };
    if (best === null || compareMatches(candidate, best) < 0) best = candidate;
  }

  if (best === null) return null;
  return {
    route: best.route,
    path: pathname,
    pattern: best.pattern,
    params: best.params,
  };
}
