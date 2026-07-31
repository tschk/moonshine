"use client";

/**
 * @tschk/moonshine-tanstack
 *
 * Moonshine + TanStack libraries:
 *   `@tschk/moonshine-tanstack/query`  — react-query
 *   `@tschk/moonshine-tanstack/router` — react-router
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
  deps?: Array<Signal<unknown> | (() => unknown)>;
};

/** Standalone async resource (no react-query required). */
export function createQuerySignal<T>(
  queryFn: () => Promise<T>,
  options: QuerySignalOptions<T> = {},
): Resource<T> {
  const resource = createResource(queryFn, {
    initial: options.initial,
    immediate: options.immediate,
  });
  if (options.deps?.length) {
    const tick = createMemo(() => {
      for (const d of options.deps!) {
        if (typeof d === "function") d();
      }
      return 0;
    });
    tick.subscribe(() => {
      void resource.refetch();
    });
    tick();
  }
  return resource;
}

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

export function createPathnameSignal(): Signal<string> {
  const read = () =>
    typeof window === "undefined" ? "/" : window.location.pathname || "/";
  const signal = createSignal(read());
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => signal.set(read()));
  }
  return signal;
}
