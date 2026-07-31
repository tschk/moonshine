"use client";

/**
 * @tschk/moonshine-react-router
 *
 * The `react-router` / `@remix-run/react` client API reimplemented on
 * moonshine's router. Alias `react-router` to this package to drop the
 * dependency.
 */
export { Link, NavLink, Navigate, default as LinkDefault } from "./link";
export type {
  LinkProps,
  NavLinkProps,
  NavLinkRenderState,
  NavigateProps,
} from "./link";

export {
  useHref,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
  useResolvedPath,
  useSearchParams,
} from "./navigation";
export type {
  NavigateFunction,
  NavigateOptions,
  NavigationType,
  SetURLSearchParams,
} from "./navigation";

export { Outlet, OutletProvider, useOutlet, useOutletContext } from "./outlet";
export type {
  OutletContextValue,
  OutletProps,
  OutletProviderProps,
} from "./outlet";

export type { Location, To } from "./location";

export {
  ErrorResponse,
  data,
  isRouteErrorResponse,
  json,
  redirect,
  redirectDocument,
  replace,
} from "./responses";
