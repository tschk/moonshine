"use client";

/**
 * @tschk/moonshine-astro
 *
 * Astro client islands (`client:load` / `client:visible`). Same host-react
 * surface plus optional mini-router and shaders for island SPAs.
 *
 * ```tsx
 * "use client";
 * import { createSignal, useSignal } from "@tschk/moonshine-astro";
 * ```
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
