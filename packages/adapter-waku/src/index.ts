"use client";

/**
 * @tschk/moonshine-waku
 *
 * Waku client islands + optional mini-router/shaders.
 */
export * from "@tschk/moonshine/host-react";

export {
  Link,
  MoonshineRouter,
  createMoonshineRouter,
  getLocation,
  matchPath,
  matchRoutes,
  navigate,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from "@tschk/moonshine/router";

export type {
  MoonshineRouterInstance,
  MoonshineRouterProps,
  RouteDefinition,
  RouteMatch,
  RouteParams,
} from "@tschk/moonshine/router";

export {
  createFullscreenFragment,
  useFragmentShader,
  wrapFragmentSource,
} from "@tschk/moonshine/shaders";

import {
  createIslandSignal,
  createResource,
  useSignal,
  type Signal,
} from "@tschk/moonshine/host-react";

/**
 * RSC-friendly client read: uses signal.peek() as server snapshot automatically
 * via useSignal.
 */
export function useWakuSignal<T>(signal: Signal<T>): T {
  return useSignal(signal, () => signal.peek());
}

/** Client-only shared signal bag for Waku islands in one page. */
const bag = new Map<string, Signal<unknown>>();

export function createSharedIslandSignal<T>(key: string, initial: T): Signal<T> {
  let s = bag.get(key) as Signal<T> | undefined;
  if (!s) {
    s = createIslandSignal(initial);
    bag.set(key, s as Signal<unknown>);
  }
  return s;
}

export function clearSharedIslandSignals(): void {
  bag.clear();
}

export function preloadWakuData<T>(fetcher: () => Promise<T>) {
  return createResource(fetcher, { immediate: true });
}

export { createIslandSignal };
