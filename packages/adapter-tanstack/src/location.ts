"use client";

/**
 * TanStack Router's location shape, derived from the moonshine router signal.
 *
 * History state is subscribed independently so same-path navigations update.
 */
import { useMemo, useReducer } from "react";
import {
  useLocation as useMoonshineLocation,
  useHistory as useMoonshineHistory,
} from "@tschk/moonshine/router";

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
  state?: Record<string, unknown>;
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
      if (segment === "$") return params["*"] ?? params.splat ?? "";
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

function browserPart(part: "hash"): string {
  if (typeof window === "undefined") return "";
  return window.location[part];
}

/** Forces a re-render; used after navigations that only change the query. */
export function useRerender(): () => void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return bump;
}

export function useParsedLocation(): ParsedLocation {
  const source = useMoonshineLocation();
  const pathname = source.split("?", 1)[0]!;
  const history = useMoonshineHistory();
  const searchStr = source.includes("?")
    ? source.slice(source.indexOf("?"))
    : "";
  const hash = browserPart("hash");
  return useMemo(
    () => ({
      href: `${pathname}${searchStr}${hash}`,
      pathname,
      search: parseSearch(searchStr),
      searchStr,
      hash,
      state: (history.state ?? {}) as Record<string, unknown>,
    }),
    [pathname, searchStr, hash, history],
  );
}
