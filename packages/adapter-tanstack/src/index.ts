"use client";

/**
 * @tschk/moonshine-tanstack
 *
 * TanStack Start / Router client surface. Host owns routing.
 */
export * from "@tschk/moonshine/host-react";

import {
  createMemo,
  createResource,
  createSignal,
  type Resource,
  type Signal,
} from "@tschk/moonshine";

export type QuerySignalOptions<T> = {
  initial?: T;
  immediate?: boolean;
  /** When these signals change, refetch. */
  deps?: Array<Signal<unknown> | (() => unknown)>;
};

/**
 * Async query as moonshine resource (TanStack Query-shaped without the dep).
 *
 * ```ts
 * const q = createQuerySignal(() => fetch("/api").then(r => r.json()));
 * q(); q.loading(); await q.refetch();
 * ```
 */
export function createQuerySignal<T>(
  queryFn: () => Promise<T>,
  options: QuerySignalOptions<T> = {},
): Resource<T> {
  const resource = createResource(queryFn, {
    initial: options.initial,
    immediate: options.immediate,
  });

  if (options.deps?.length) {
    // Refetch when any dep notification fires (pull latest via memo tick).
    const tick = createMemo(() => {
      for (const d of options.deps!) {
        if (typeof d === "function") d();
      }
      return 0;
    });
    tick.subscribe(() => {
      void resource.refetch();
    });
    // establish subscription graph
    tick();
  }

  return resource;
}

/**
 * Pathname signal synced from `window.location` + popstate.
 * Use beside TanStack Router for lightweight reads without importing the router.
 */
export function createPathnameSignal(): Signal<string> {
  const read = () =>
    typeof window === "undefined" ? "/" : window.location.pathname || "/";
  const signal = createSignal(read());
  if (typeof window !== "undefined") {
    const onPop = () => signal.set(read());
    window.addEventListener("popstate", onPop);
  }
  return signal;
}

/** Mutation helper: run async work while exposing pending/error signals. */
export function createMutationSignal<TArg, TResult>(
  mutationFn: (arg: TArg) => Promise<TResult>,
): {
  pending: Signal<boolean>;
  error: Signal<Error | undefined>;
  data: Signal<TResult | undefined>;
  mutate: (arg: TArg) => Promise<TResult | undefined>;
} {
  const pending = createSignal(false);
  const error = createSignal<Error | undefined>(undefined);
  const data = createSignal<TResult | undefined>(undefined);

  const mutate = async (arg: TArg) => {
    pending.set(true);
    error.set(undefined);
    try {
      const result = await mutationFn(arg);
      data.set(() => result);
      return result;
    } catch (e) {
      error.set(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    } finally {
      pending.set(false);
    }
  };

  return { pending, error, data, mutate };
}
