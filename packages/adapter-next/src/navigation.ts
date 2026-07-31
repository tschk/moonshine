"use client";

/**
 * `next/navigation` implemented on the moonshine router.
 *
 * ```ts
 * import { useRouter, usePathname } from "@tschk/moonshine-next/navigation";
 * ```
 */
import { useMemo } from "react";
import {
  navigate,
  useLocation,
  useParams as useMoonshineParams,
} from "@tschk/moonshine/router";
import { createSignal, useSignal, type Signal } from "@tschk/moonshine/react";

export type AppRouterInstance = {
  push(href: string, options?: { scroll?: boolean }): void;
  replace(href: string, options?: { scroll?: boolean }): void;
  back(): void;
  forward(): void;
  refresh(): void;
  prefetch(href: string): void;
};

/** Splits `"/a/b?x=1"` into its pathname and its raw query string. */
export function splitLocation(location: string): [string, string] {
  const index = location.indexOf("?");
  return index === -1
    ? [location, ""]
    : [location.slice(0, index), location.slice(index + 1)];
}

/**
 * The moonshine router stores only the pathname, so a query string survives
 * navigation on `window.location` but not in the location signal. Prefer the
 * signal when it carries one (SSR / controlled paths) and fall back to the
 * browser's own search.
 */
function readSearch(location: string): string {
  const fromSignal = splitLocation(location)[1];
  if (fromSignal) return fromSignal;
  if (typeof window === "undefined") return "";
  return window.location.search.replace(/^\?/, "");
}

function shouldScrollByDefault(href: string): boolean {
  if (typeof window === "undefined") return false;
  const next = new URL(href, window.location.href);
  return (
    next.pathname !== window.location.pathname ||
    next.hash !== window.location.hash
  );
}

export function useRouter(): AppRouterInstance {
  return useMemo(
    () => ({
      push: (href, options) => {
        const jump = options?.scroll ?? shouldScrollByDefault(href);
        navigate(href);
        if (jump) globalThis.scrollTo?.(0, 0);
      },
      replace: (href, options) => {
        const jump = options?.scroll ?? shouldScrollByDefault(href);
        navigate(href, { replace: true });
        if (jump) globalThis.scrollTo?.(0, 0);
      },
      back: () => globalThis.history?.back(),
      forward: () => globalThis.history?.forward(),
      // Moonshine re-renders from its signal graph, so there is no server
      // round trip to invalidate.
      refresh: () => {},
      prefetch: () => {},
    }),
    [],
  );
}

export function usePathname(): string {
  return splitLocation(useLocation())[0];
}

export function useSearchParams(): URLSearchParams {
  const query = readSearch(useLocation());
  return useMemo(() => new URLSearchParams(query), [query]);
}

export function useParams(): Record<string, string> {
  return useMoonshineParams();
}

export function useSelectedLayoutSegments(): string[] {
  return usePathname().split("/").filter(Boolean);
}

export function useSelectedLayoutSegment(): string | null {
  return useSelectedLayoutSegments()[0] ?? null;
}

/** Thrown to unwind rendering, matching Next's control-flow contract. */
export class RedirectError extends Error {
  constructor(
    readonly url: string,
    readonly permanent: boolean,
  ) {
    super(`redirect: ${url}`);
    this.name = "RedirectError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("not found");
    this.name = "NotFoundError";
  }
}

export function redirect(url: string): never {
  throw new RedirectError(url, false);
}

export function permanentRedirect(url: string): never {
  throw new RedirectError(url, true);
}

export function notFound(): never {
  throw new NotFoundError();
}

/** Pathname as a live moonshine signal. */
export function usePathnameSignal(): Signal<string> {
  const pathname = usePathname();
  const signal = useMemo(() => createSignal(pathname), []);
  if (signal() !== pathname) signal.set(pathname);
  useSignal(signal);
  return signal;
}
