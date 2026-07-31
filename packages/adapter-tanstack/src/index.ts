"use client";

/**
 * @tschk/moonshine-tanstack
 *
 * The TanStack Router / Start client API reimplemented on moonshine's router.
 * Alias `@tanstack/react-router` to this package to drop the dependency.
 *
 * Route-tree generation (`createFileRoute`, `routeTree.gen.ts`) is not provided
 * — it requires the TanStack Vite plugin. See the README.
 */
export { Link, Navigate } from "./link";
export type { LinkProps, LinkRenderState, NavigateProps } from "./link";

export {
  NotFound,
  Redirect,
  isNotFound,
  isRedirect,
  notFound,
  redirect,
  useCanGoBack,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from "./navigation";
export type { NavigateFn, RouterInstance, RouterState } from "./navigation";

export { Outlet, OutletProvider } from "./outlet";
export type { OutletProviderProps } from "./outlet";

export {
  buildHref,
  interpolatePath,
  parseSearch,
  stringifySearch,
} from "./location";
export type { ParsedLocation, SearchRecord, ToOptions } from "./location";
