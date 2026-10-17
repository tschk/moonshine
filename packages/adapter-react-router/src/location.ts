"use client";

/**
 * Location shape shared by the react-router hooks.
 *
 * History state is subscribed independently so same-path navigations update.
 */
import { useMemo, useReducer } from "react";
import {
  useLocation as useMoonshineLocation,
  useHistory as useMoonshineHistory,
} from "@tschk/moonshine/router";

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

function browserPart(part: "hash"): string {
  if (typeof window === "undefined") return "";
  return window.location[part];
}

/** Forces a re-render; used after navigations that only change the query. */
export function useRerender(): () => void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return bump;
}

export function useLocationObject(): Location {
  const source = useMoonshineLocation();
  const pathname = source.split("?", 1)[0]!;
  const history = useMoonshineHistory();
  const search = source.includes("?") ? source.slice(source.indexOf("?")) : "";
  const hash = browserPart("hash");
  return useMemo(
    () => ({
      pathname,
      search,
      hash,
      state: history.state,
      key: `${pathname}${search}${hash}`,
    }),
    [pathname, search, hash, history],
  );
}
