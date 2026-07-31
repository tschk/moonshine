import type { ReactNode } from "react";
import {
  compilePattern,
  createRouteGraph,
  matchRoutes as matchRoutesOnGraph,
  createMoonshineRouter,
  navigate,
  getLocation,
  useLocation,
  useParams,
  useNavigate,
  useRouter,
  MoonshineRouter,
  Link,
  type MoonshineRouterProps,
  type MoonshineRouterInstance,
} from "@tschk/moonshine-router";

export type RouteParams = Record<string, string>;

export type RouteMatch = {
  path: string;
  pattern: string;
  params: RouteParams;
};

export type RouteDefinition = {
  /** Path pattern, e.g. `/`, `/about`, `/users/:id`. */
  path: string;
  element: ReactNode;
};

/** Compile `/users/:id` → matcher with named params. */
export function matchPath(
  pattern: string,
  pathname: string,
): RouteMatch | null {
  const compiled = compilePattern(pattern);
  const result = compiled.match(pathname);
  if (!result) return null;
  return { path: pathname, pattern, params: result.params };
}

/** Resolve first matching route definition. */
export function matchRoutes(
  routes: RouteDefinition[],
  pathname: string,
): (RouteMatch & { element: ReactNode }) | null {
  const graph = createRouteGraph(
    routes.map((route) => ({ ...route, id: route.path, file: "" })),
  );
  const match = matchRoutesOnGraph(graph, pathname);
  if (!match) return null;
  return {
    path: match.path,
    pattern: match.pattern,
    params: match.params,
    element: match.route.element,
  };
}

export {
  createMoonshineRouter,
  navigate,
  getLocation,
  useLocation,
  useParams,
  useNavigate,
  useRouter,
  MoonshineRouter,
  Link,
  type MoonshineRouterProps,
  type MoonshineRouterInstance,
};
