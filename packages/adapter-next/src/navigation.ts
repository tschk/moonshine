"use client";

/**
 * next/navigation + moonshine signal bridges.
 *
 * ```ts
 * import { usePathname, usePathnameSignal, useRouter } from "@tschk/moonshine-next/navigation";
 * ```
 */
import { useEffect, useMemo, useRef } from "react";
import {
  useParams as useNextParams,
  usePathname as useNextPathname,
  useRouter as useNextRouter,
  useSearchParams as useNextSearchParams,
  notFound,
  permanentRedirect,
  redirect,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "next/navigation";
import { createSignal, useSignal, type Signal } from "@tschk/moonshine/react";

export {
  useNextRouter as useRouter,
  useNextPathname as usePathname,
  useNextSearchParams as useSearchParams,
  useNextParams as useParams,
  redirect,
  permanentRedirect,
  notFound,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
};

/** Pathname as a live moonshine signal (updates on App Router navigation). */
export function usePathnameSignal(): Signal<string> {
  const pathname = useNextPathname();
  const signal = useMemo(() => createSignal(pathname), []);
  const ref = useRef(signal);
  ref.current = signal;
  useEffect(() => {
    ref.current.set(pathname);
  }, [pathname]);
  return signal;
}

/** Search string `?a=1` as signal. */
export function useSearchSignal(): Signal<string> {
  const sp = useNextSearchParams();
  const value = sp?.toString() ? `?${sp.toString()}` : "";
  const signal = useMemo(() => createSignal(value), []);
  useEffect(() => {
    signal.set(value);
  }, [value, signal]);
  return signal;
}

/** Read a single search param as signal. */
export function useSearchParamSignal(
  name: string,
  fallback = "",
): Signal<string> {
  const sp = useNextSearchParams();
  const value = sp?.get(name) ?? fallback;
  const signal = useMemo(() => createSignal(value), []);
  useEffect(() => {
    signal.set(value);
  }, [value, signal]);
  return signal;
}

/** Convenience: useSignal(usePathnameSignal()). */
export function useReactivePathname(): string {
  return useSignal(usePathnameSignal());
}
