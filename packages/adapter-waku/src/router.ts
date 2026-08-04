"use client";

/**
 * Waku's `waku/router/client` hooks implemented on the moonshine router.
 *
 * The route shape mirrors Waku's own `parseRoute`: `{ path, query, hash }`.
 *
 * ```ts
 * import { useRouter_UNSTABLE } from "@tschk/moonshine-waku/router";
 * ```
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { navigate, useLocation } from "@tschk/moonshine/router";

export type RouteProps = {
  /** Pathname, always with a trailing slash — Waku's convention. */
  path: string;
  /** Query string without the leading `?`. */
  query: string;
  /** Hash including the leading `#`, or an empty string. */
  hash: string;
};

export type LinkTo =
  string | { pathname: string; search?: Record<string, unknown> };

/** Waku normalises every route path to a trailing slash. */
export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function toHref(to: LinkTo): string {
  if (typeof to === "string") return to;
  const entries = Object.entries(to.search ?? {}).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) return to.pathname;
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return `${to.pathname}?${params.toString()}`;
}

function browserPart(part: "search" | "hash"): string {
  if (typeof window === "undefined") return "";
  return window.location[part];
}

/** Forces a re-render; used after navigations that only change the query. */
function useRerender(): () => void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return bump;
}

export function useRoute(): RouteProps {
  // The location signal carries the query too; the path is its first half.
  const pathname = useLocation().split("?")[0];
  const search = browserPart("search");
  const hash = browserPart("hash");
  return useMemo(
    () => ({
      path: normalizePath(pathname),
      query: search.startsWith("?") ? search.slice(1) : search,
      hash,
    }),
    [pathname, search, hash],
  );
}

export type RouterInstance = RouteProps & {
  push(to: LinkTo, options?: { scroll?: boolean }): Promise<void>;
  replace(to: LinkTo, options?: { scroll?: boolean }): Promise<void>;
  reload(): Promise<void>;
  back(): void;
  forward(): void;
  prefetch(to: LinkTo): void;
};

export function useRouter_UNSTABLE(): RouterInstance {
  const route = useRoute();
  const rerender = useRerender();

  const go = useCallback(
    (to: LinkTo, replace: boolean, scroll?: boolean) => {
      navigate(toHref(to), { replace });
      if (scroll !== false) globalThis.scrollTo?.(0, 0);
      // A query-only navigation leaves the pathname signal unchanged.
      rerender();
      return Promise.resolve();
    },
    [rerender],
  );

  return useMemo(
    () => ({
      ...route,
      push: (to, options) => go(to, false, options?.scroll),
      replace: (to, options) => go(to, true, options?.scroll),
      reload: () => {
        globalThis.location?.reload();
        return Promise.resolve();
      },
      back: () => globalThis.history?.back(),
      forward: () => globalThis.history?.forward(),
      prefetch: (to) => prefetchRoute(toHref(to)),
    }),
    [route, go],
  );
}

/** Alias — Waku ships the hook under both names. */
export const useRouter = useRouter_UNSTABLE;

const prefetched = new Set<string>();

/** Warms the browser cache for `url` once, the way Waku prefetches a route. */
export function prefetchRoute(url: string): void {
  if (prefetched.has(url) || typeof document === "undefined") return;
  prefetched.add(url);
  const tag = document.createElement("link");
  tag.rel = "prefetch";
  tag.href = url;
  document.head.append(tag);
}

/** Matches a Waku route template such as `/posts/[slug]` against a path. */
export function matchRouteParams(
  from: string,
  path: string,
): Record<string, string> | null {
  const template = normalizePath(from).split("/").filter(Boolean);
  const actual = normalizePath(path).split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < template.length; i++) {
    const segment = template[i]!;
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      params[segment.slice(4, -1)] = actual.slice(i).join("/");
      return params;
    }
    const value = actual[i];
    if (value === undefined) return null;
    if (segment.startsWith("[") && segment.endsWith("]")) {
      params[segment.slice(1, -1)] = value;
      continue;
    }
    if (segment !== value) return null;
  }
  return actual.length === template.length ? params : null;
}

export function useParams_UNSTABLE({
  from,
}: {
  from: string;
}): Record<string, string> | null {
  const { path } = useRoute();
  return useMemo(() => matchRouteParams(from, path), [from, path]);
}

export function useSearch_UNSTABLE({
  from,
}: {
  from: string;
}): URLSearchParams | null {
  const { path, query } = useRoute();
  return useMemo(
    () =>
      matchRouteParams(from, path) === null ? null : new URLSearchParams(query),
    [from, path, query],
  );
}

export type SetSearch = (
  update:
    | Record<string, string>
    | ((current: URLSearchParams) => Record<string, string>),
  options?: { scroll?: boolean; history?: "push" | "replace" },
) => void;

export function useSetSearch_UNSTABLE({ from }: { from: string }): SetSearch {
  const { path, query } = useRoute();
  const rerender = useRerender();
  return useCallback(
    (update, options) => {
      if (matchRouteParams(from, path) === null) return;
      const current = new URLSearchParams(query);
      const partial = typeof update === "function" ? update(current) : update;
      for (const [key, value] of Object.entries(partial))
        current.set(key, value);
      const next = current.toString();
      navigate(`${path}${next ? `?${next}` : ""}`, {
        replace: options?.history === "replace",
      });
      if (options?.scroll === true) globalThis.scrollTo?.(0, 0);
      rerender();
    },
    [from, path, query, rerender],
  );
}

export type NavigationStatus = { pending?: boolean };

export const NavigationStatusContext = createContext<NavigationStatus>({});

/** Navigation status of the enclosing `Link`, like React's `useFormStatus`. */
export function useNavigationStatus_UNSTABLE(): NavigationStatus {
  return useContext(NavigationStatusContext);
}
