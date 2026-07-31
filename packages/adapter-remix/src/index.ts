"use client";

/**
 * @tschk/moonshine-remix
 *
 * Moonshine signals + helpers.
 * Remix libraries: `@tschk/moonshine-remix/react`
 * Remix+signal hooks: `@tschk/moonshine-remix/hooks`
 */
export * from "@tschk/moonshine/host-react";

import { createSignal, type Signal } from "@tschk/moonshine";
import { createResource, type Resource } from "@tschk/moonshine";

const loaderSignals = new Map<string, Signal<unknown>>();

/** Seed/cache a signal from loader data by route key. */
export function useLoaderSignal<T>(seed: T, key: string): Signal<T> {
  let s = loaderSignals.get(key) as Signal<T> | undefined;
  if (!s) {
    s = createSignal(seed);
    loaderSignals.set(key, s as Signal<unknown>);
  } else if (!Object.is(s.peek(), seed)) {
    s.set(() => seed);
  }
  return s;
}

export function clearLoaderSignals(): void {
  loaderSignals.clear();
}

export function createLoaderResource<T>(
  fetcher: () => Promise<T>,
  options?: { immediate?: boolean; initial?: T },
): Resource<T> {
  return createResource(fetcher, options);
}

export function createSearchParamSignal(
  name: string,
  fallback = "",
): Signal<string> {
  const read = () => {
    if (typeof window === "undefined") return fallback;
    return new URL(window.location.href).searchParams.get(name) ?? fallback;
  };
  const signal = createSignal(read());
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => signal.set(read()));
  }
  const originalSet = signal.set.bind(signal);
  signal.set = (value) => {
    const next =
      typeof value === "function"
        ? (value as (p: string) => string)(signal.peek())
        : value;
    originalSet(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (!next) url.searchParams.delete(name);
      else url.searchParams.set(name, next);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  };
  return signal;
}
