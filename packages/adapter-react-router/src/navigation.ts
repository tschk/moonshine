"use client";

/**
 * `react-router` navigation hooks implemented on the moonshine router.
 *
 * ```ts
 * import { useNavigate, useLocation } from "@tschk/moonshine-react-router";
 * ```
 */
import { useCallback, useMemo } from "react";
import {
  navigate,
  useParams as useMoonshineParams,
} from "@tschk/moonshine/router";
import {
  toHref,
  useLocationObject,
  useRerender,
  type Location,
  type To,
} from "./location";

export type NavigateOptions = {
  replace?: boolean;
  /** Accepted for source compatibility; history state is not tracked. */
  state?: unknown;
  preventScrollReset?: boolean;
};

export type NavigateFunction = {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
};

export function useLocation(): Location {
  return useLocationObject();
}

export function useNavigate(): NavigateFunction {
  const rerender = useRerender();
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        globalThis.history?.go(to);
        return;
      }
      navigate(toHref(to), { replace: options?.replace });
      if (options?.preventScrollReset !== true) globalThis.scrollTo?.(0, 0);
      rerender();
    },
    [rerender],
  ) as NavigateFunction;
}

export function useParams<
  T extends Record<string, string> = Record<string, string>,
>(): T {
  return useMoonshineParams() as T;
}

export type SetURLSearchParams = (
  next:
    | URLSearchParams
    | Record<string, string>
    | ((current: URLSearchParams) => URLSearchParams),
  options?: NavigateOptions,
) => void;

export function useSearchParams(): [URLSearchParams, SetURLSearchParams] {
  const location = useLocationObject();
  const rerender = useRerender();
  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  const setSearchParams = useCallback<SetURLSearchParams>(
    (next, options) => {
      const resolved =
        typeof next === "function"
          ? next(new URLSearchParams(location.search))
          : next instanceof URLSearchParams
            ? next
            : new URLSearchParams(next);
      const query = resolved.toString();
      navigate(`${location.pathname}${query ? `?${query}` : ""}`, {
        replace: options?.replace,
      });
      // A query-only navigation leaves the pathname signal unchanged.
      rerender();
    },
    [location.pathname, location.search, rerender],
  );

  return [params, setSearchParams];
}

/** react-router resolves relative `to` values against the current pathname. */
export function useResolvedPath(to: To): Location {
  const { pathname } = useLocationObject();
  const href = toHref(to);
  return useMemo(() => {
    const base = href.startsWith("/")
      ? href
      : new URL(
          href,
          `http://x${pathname.endsWith("/") ? pathname : `${pathname}/`}`,
        )
          .toString()
          .slice("http://x".length);
    const hashAt = base.indexOf("#");
    const withoutHash = hashAt === -1 ? base : base.slice(0, hashAt);
    const hash = hashAt === -1 ? "" : base.slice(hashAt);
    const queryAt = withoutHash.indexOf("?");
    return {
      pathname: queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt),
      search: queryAt === -1 ? "" : withoutHash.slice(queryAt),
      hash,
      state: null,
      key: base,
    };
  }, [href, pathname]);
}

export function useHref(to: To): string {
  const resolved = useResolvedPath(to);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export type NavigationType = "POP" | "PUSH" | "REPLACE";

/**
 * Moonshine does not record how the current entry was reached, so this always
 * reports `POP`.
 */
export function useNavigationType(): NavigationType {
  return "POP";
}
