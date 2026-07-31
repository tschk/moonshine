"use client";

/**
 * @tschk/moonshine-remix
 *
 * Remix / React Router client modules. Host owns routing — no MoonshineRouter.
 */
export * from "@tschk/moonshine/host-react";

import { createSignal, type Signal } from "@tschk/moonshine";
import { createResource, type Resource } from "@tschk/moonshine";

/**
 * Seed a client signal from loader/action data (call in component body once).
 * Updates stay client-side until the next navigation provides new seed via key.
 */
export function useLoaderSignal<T>(seed: T, key?: string | number): Signal<T> {
  // Module-stable map so the same route key reuses the signal instance.
  const bucket = loaderSignals as Map<string, Signal<unknown>>;
  const id = key === undefined ? undefined : String(key);
  if (id !== undefined) {
    let s = bucket.get(id) as Signal<T> | undefined;
    if (!s) {
      s = createSignal(seed);
      bucket.set(id, s as Signal<unknown>);
    } else if (!Object.is(s.peek(), seed)) {
      // Fresh loader data after revalidation
      s.set(() => seed);
    }
    return s;
  }
  // No key: ephemeral per call site is wrong for hooks — require key in real apps.
  // Fallback: new signal each first call via WeakMap on seed object identity not possible for primitives.
  return createSignal(seed);
}

const loaderSignals = new Map<string, Signal<unknown>>();

/** Clear cached loader signals (tests / hard navigations). */
export function clearLoaderSignals(): void {
  loaderSignals.clear();
}

/**
 * Resource that refetches when `deps` signal/memo values change.
 * Useful beside Remix loaders for client-only secondary data.
 */
export function createLoaderResource<T>(
  fetcher: () => Promise<T>,
  options?: { immediate?: boolean; initial?: T },
): Resource<T> {
  return createResource(fetcher, options);
}

/**
 * Bind a string signal to the browser URL search param (client-only).
 * Does not call Remix navigate — uses History API so RR can pick up on popstate.
 */
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
    const sync = () => signal.set(read());
    window.addEventListener("popstate", sync);
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
