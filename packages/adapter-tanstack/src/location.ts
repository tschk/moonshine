"use client";

/**
 * TanStack Router's location shape, derived from the moonshine router signal.
 *
 * Moonshine's signal carries the pathname only, so `search` and `hash` are read
 * back from `window.location` on each render.
 */
import { useMemo, useReducer } from "react";
import { useLocation as useMoonshineLocation } from "@tschk/moonshine/router";

export type SearchRecord = Record<string, unknown>;

export type ParsedLocation = {
  href: string;
  pathname: string;
  search: SearchRecord;
  searchStr: string;
  hash: string;
  state: Record<string, unknown>;
};

export type ToOptions = {
  to?: string;
  from?: string;
  params?: Record<string, string>;
  search?: SearchRecord | ((current: SearchRecord) => SearchRecord);
  hash?: string;
  replace?: boolean;
  resetScroll?: boolean;
};

/** `parseSearch` — TanStack decodes JSON values inside query params. */
export function parseSearch(searchStr: string): SearchRecord {
  const out: SearchRecord = {};
  for (const [key, value] of new URLSearchParams(searchStr)) {
    try {
      out[key] = JSON.parse(value) as unknown;
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/** `stringifySearch` — the inverse of {@link parseSearch}. */
export function stringifySearch(search: SearchRecord): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Fills `$param` / `$` placeholders in a `to` template. */
export function interpolatePath(
  to: string,
  params: Record<string, string> = {},
): string {
  return to
    .split("/")
    .map((segment) => {
      if (segment === "$") return params["*"] ?? params._splat ?? "";
      if (segment.startsWith("$")) return params[segment.slice(1)] ?? segment;
      return segment;
    })
    .join("/");
}

/** Builds the final URL string for a `ToOptions` navigation descriptor. */
export function buildHref(
  options: ToOptions,
  currentSearch: SearchRecord = {},
): string {
  const pathname = interpolatePath(options.to ?? "", options.params);
  const search =
    typeof options.search === "function"
      ? options.search(currentSearch)
      : (options.search ?? {});
  const hash = options.hash
    ? options.hash.startsWith("#")
      ? options.hash
      : `#${options.hash}`
    : "";
  return `${pathname}${stringifySearch(search)}${hash}`;
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

export function useParsedLocation(): ParsedLocation {
  const pathname = useMoonshineLocation();
  const searchStr = browserPart("search");
  const hash = browserPart("hash");
  return useMemo(
    () => ({
      href: `${pathname}${searchStr}${hash}`,
      pathname,
      search: parseSearch(searchStr),
      searchStr,
      hash,
      // History state is not tracked by the moonshine router.
      state: {},
    }),
    [pathname, searchStr, hash],
  );
}
