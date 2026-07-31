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
  const matches: {
    route: T;
    pattern: string;
    params: Record<string, string>;
    score: number[];
  }[] = [];

  for (const { route, compiled } of graph.routes) {
    const m = compiled.match(pathname);
    if (!m) continue;
    matches.push({
      route,
      pattern: compiled.pattern,
      params: m.params,
      score: m.score,
    });
  }

  if (matches.length === 0) return null;
  matches.sort(compareMatches);
  const best = matches[0]!;
  return {
    route: best.route,
    path: pathname,
    pattern: best.pattern,
    params: best.params,
  };
}
