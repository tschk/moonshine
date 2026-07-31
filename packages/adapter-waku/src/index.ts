"use client";

/**
 * @tschk/moonshine-waku
 *
 * Waku's client router API reimplemented on moonshine's router. Alias
 * `waku/router/client` to this package to drop the dependency.
 *
 * Waku's RSC pieces (`Slice`, `Children`, `unstable_defineRouter`) are not
 * provided — see the README.
 */
export { Link, default as LinkDefault } from "./link";
export type { LinkProps } from "./link";

export {
  NavigationStatusContext,
  matchRouteParams,
  normalizePath,
  prefetchRoute,
  toHref,
  useNavigationStatus_UNSTABLE,
  useParams_UNSTABLE,
  useRoute,
  useRouter,
  useRouter_UNSTABLE,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from "./router";
export type {
  LinkTo,
  NavigationStatus,
  RouteProps,
  RouterInstance,
  SetSearch,
} from "./router";
