"use client";

/**
 * @tschk/moonshine-waku
 *
 * Moonshine + Waku libraries (`/router`, `/shaders`).
 */
export * from "@tschk/moonshine/host-react";

export {
  Link as MoonshineLink,
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

import {
  createIslandSignal,
  createResource,
  useSignal,
  type Signal,
} from "@tschk/moonshine/host-react";

export function useWakuSignal<T>(signal: Signal<T>): T {
  return useSignal(signal, () => signal.peek());
}

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
