"use client";

/**
 * @tschk/moonshine-astro
 *
 * Astro client islands (`client:load` / `client:visible`).
 */
export * from "@tschk/moonshine/host-react";

export {
  Link,
  MoonshineRouter,
  createMoonshineRouter,
  matchPath,
  matchRoutes,
  navigate,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from "@tschk/moonshine/router";

export type {
  MoonshineRouterInstance,
  MoonshineRouterProps,
  RouteDefinition,
  RouteMatch,
  RouteParams,
} from "@tschk/moonshine/router";

export {
  createFullscreenFragment,
  useFragmentShader,
  wrapFragmentSource,
} from "@tschk/moonshine/shaders";

import type { ComponentType } from "react";
import { createIslandSignal, createResource } from "@tschk/moonshine/host-react";

export type IslandOptions = {
  /** Optional debug name for Astro island boundaries. */
  name?: string;
};

/**
 * Mark a React component as a moonshine island (identity + displayName).
 * Use with Astro: `import Island from ...` then `<Island client:load />`.
 */
export function defineIsland<P extends object>(
  Component: ComponentType<P>,
  options: IslandOptions = {},
): ComponentType<P> {
  const name = options.name ?? Component.displayName ?? Component.name ?? "MoonshineIsland";
  const Island = Component;
  Island.displayName = name;
  return Island;
}

/** Prefetch JSON for an island before hydrate (call in island module scope). */
export function preloadIslandData<T>(
  fetcher: () => Promise<T>,
  opts?: { initial?: T },
) {
  return createResource(fetcher, { initial: opts?.initial, immediate: true });
}

export { createIslandSignal };
