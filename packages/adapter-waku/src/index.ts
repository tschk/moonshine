"use client";

/**
 * @tschk/moonshine-waku
 *
 * Waku client islands. Moonshine signals + optional island router/shaders.
 *
 * ```tsx
 * "use client";
 * import { createSignal, useSignal } from "@tschk/moonshine-waku";
 * ```
 */

export * from "@tschk/moonshine/host-react";

export {
  Link,
  MoonshineRouter,
  createMoonshineRouter,
  getLocation,
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
