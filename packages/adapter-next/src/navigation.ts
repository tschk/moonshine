"use client";

/**
 * `next/navigation` implemented on the moonshine router.
 *
 * ```ts
 * import { useRouter, usePathname } from "@tschk/moonshine-next/navigation";
 * ```
 */
import { useMemo } from "react";
import { safeHref } from "@tschk/moonshine-router";
import {
  useNavigate as useMoonshineNavigate,
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

/** The scoped location signal is the source of truth for query state. */
function readSearch(location: string): string {
  return splitLocation(location)[1];
}

function shouldScrollByDefault(href: string): boolean {
  if (typeof window === "undefined") return false;
  const next = new URL(href, window.location.href);
  return (
    next.pathname !== window.location.pathname ||
    next.hash !== window.location.hash
  );
}

function navigateExternal(href: string, replace: boolean): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(safeHref(href), window.location.href);
  if (url.origin === window.location.origin) return false;
  if (replace) window.location.replace(url.href);
  else window.location.assign(url.href);
  return true;
}

export function useRouter(): AppRouterInstance {
  const navigate = useMoonshineNavigate();
  return useMemo(
    () => ({
      push: (href, options) => {
        if (navigateExternal(href, false)) return;
        const jump = options?.scroll ?? shouldScrollByDefault(href);
        navigate(href);
        if (jump) globalThis.scrollTo?.(0, 0);
      },
      replace: (href, options) => {
        if (navigateExternal(href, true)) return;
        const jump = options?.scroll ?? shouldScrollByDefault(href);
        navigate(href, { replace: true });
        if (jump) globalThis.scrollTo?.(0, 0);
      },
      back: () => globalThis.history?.back(),
      forward: () => globalThis.history?.forward(),
      // Reload server data through a document request; local component state resets.
      // State-preserving RSC refresh is not supported.
      refresh: () => globalThis.location?.reload(),
      prefetch: () => {},
    }),
    [navigate],
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
