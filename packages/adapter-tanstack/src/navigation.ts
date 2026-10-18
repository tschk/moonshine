"use client";

/**
 * TanStack Router hooks implemented on the moonshine router.
 *
 * ```ts
 * import { useNavigate, useRouterState } from "@tschk/moonshine-tanstack";
 * ```
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  useNavigate as useMoonshineNavigate,
  useParams as useMoonshineParams,
  useRouter as useMoonshineRouter,
} from "@tschk/moonshine/router";
import {
  buildHref,
  useParsedLocation,
  useRerender,
  type ParsedLocation,
  type SearchRecord,
  type ToOptions,
} from "./location";

export type NavigateFn = (options: ToOptions) => void;

export type RouterInstance = {
  navigate: NavigateFn;
  buildLocation: (options: ToOptions) => { href: string };
  history: {
    back(): void;
    forward(): void;
    go(delta: number): void;
  };
  invalidate(): Promise<void>;
  state: { location: ParsedLocation };
};

export function useNavigate(): NavigateFn {
  const navigate = useMoonshineNavigate();
  const location = useParsedLocation();
  const rerender = useRerender();
  return useCallback(
    (options: ToOptions) => {
      const href = buildHref(
        { ...options, to: options.to ?? location.pathname },
        location.search,
      );
      navigate(href, { replace: options.replace, state: options.state });
      if (options.resetScroll !== false) globalThis.scrollTo?.(0, 0);
      rerender();
    },
    [navigate, location.pathname, location.search, rerender],
  );
}

export function useRouter(): RouterInstance {
  const runtime = useMoonshineRouter();
  const location = useParsedLocation();
  const go = useNavigate();
  return useMemo(
    () => ({
      navigate: go,
      buildLocation: (options: ToOptions) => ({
        href: buildHref(options, location.search),
      }),
      history: {
        back: () => globalThis.history?.back(),
        forward: () => globalThis.history?.forward(),
        go: (delta: number) => globalThis.history?.go(delta),
      },
      invalidate: async () => {
        if (!runtime.invalidate)
          throw new Error(
            "Route invalidation requires an opt-in Moonshine data router",
          );
        await runtime.invalidate().catch(() => {});
      },
      state: { location },
    }),
    [go, location, runtime],
  );
}

export type RouterState = {
  location: ParsedLocation;
  status: "idle" | "pending";
  isLoading: boolean;
  isTransitioning: false;
  matches: never[];
};

const noop = () => {};
const subscribeEmpty = () => noop;

export function useRouterState<T = RouterState>(options?: {
  select?: (state: RouterState) => T;
}): T {
  const location = useParsedLocation();
  const runtime = useMoonshineRouter();
  const pending = useSyncExternalStore(
    runtime.data?.subscribe ?? subscribeEmpty,
    () => runtime.data?.peek().status === "pending",
    () => runtime.data?.peek().status === "pending",
  );
  const state = useMemo<RouterState>(
    () => ({
      location,
      status: pending ? "pending" : "idle",
      isLoading: pending,
      isTransitioning: false,
      matches: [],
    }),
    [location, pending],
  );
  return (options?.select ? options.select(state) : state) as T;
}

export function useLocation(): ParsedLocation {
  return useParsedLocation();
}

export function useParams<
  T extends Record<string, string> = Record<string, string>,
>(_options?: { from?: string; strict?: boolean }): T {
  return useMoonshineParams() as T;
}

export function useSearch<T extends SearchRecord = SearchRecord>(_options?: {
  from?: string;
  strict?: boolean;
  select?: (search: SearchRecord) => T;
}): T {
  const { search } = useParsedLocation();
  return (_options?.select ? _options.select(search) : search) as T;
}

export function useCanGoBack(): boolean {
  return (globalThis.history?.length ?? 0) > 1;
}

/** Thrown to unwind rendering, matching TanStack's control-flow contract. */
export class Redirect extends Error {
  constructor(readonly options: ToOptions & { statusCode?: number }) {
    super(`redirect: ${options.to ?? ""}`);
    this.name = "Redirect";
  }
}

export class NotFound extends Error {
  constructor(readonly data?: unknown) {
    super("not found");
    this.name = "NotFound";
  }
}

/** Returns the error (TanStack's contract is `throw redirect({ to })`). */
export function redirect(
  options: ToOptions & { statusCode?: number; throw?: boolean },
): Redirect {
  const error = new Redirect(options);
  if (options.throw === true) throw error;
  return error;
}

export function notFound(options?: {
  data?: unknown;
  throw?: boolean;
}): NotFound {
  const error = new NotFound(options?.data);
  if (options?.throw === true) throw error;
  return error;
}

export function isRedirect(value: unknown): value is Redirect {
  return value instanceof Redirect;
}

export function isNotFound(value: unknown): value is NotFound {
  return value instanceof NotFound;
}
