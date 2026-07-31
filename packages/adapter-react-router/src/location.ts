"use client";

/**
 * Location shape shared by the react-router hooks.
 *
 * Moonshine's router signal carries the pathname only, so `search` and `hash`
 * are read back from `window.location` on each render.
 */
import { useMemo, useReducer } from "react";
import { useLocation as useMoonshineLocation } from "@tschk/moonshine/router";

export type Location<S = unknown> = {
  pathname: string;
  search: string;
  hash: string;
  state: S | null;
  key: string;
};

export type To = string | { pathname?: string; search?: string; hash?: string };

/** Normalises a `To` into a single URL string. */
export function toHref(to: To): string {
  if (typeof to === "string") return to;
  const search = to.search
    ? to.search.startsWith("?")
      ? to.search
      : `?${to.search}`
    : "";
  const hash = to.hash
    ? to.hash.startsWith("#")
      ? to.hash
      : `#${to.hash}`
    : "";
  return `${to.pathname ?? ""}${search}${hash}`;
}

function browserPart(part: "search" | "hash"): string {
  if (typeof window === "undefined") return "";
  return window.location[part];
}

/** Forces a re-render; used after navigations that only change the query. */
export function useRerender(): () => void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return bump;
}

export function useLocationObject(): Location {
  const pathname = useMoonshineLocation();
  const search = browserPart("search");
  const hash = browserPart("hash");
  return useMemo(
    () => ({
      pathname,
      search,
      hash,
      // History state is not tracked by the moonshine router.
      state: null,
      key: `${pathname}${search}${hash}`,
    }),
    [pathname, search, hash],
  );
}
