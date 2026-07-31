/**
 * React bridge for `@tschk/moonshine`.
 *
 * ```ts
 * import { createApp, useSignal, createSignal } from "@tschk/moonshine/react";
 * ```
 */
import { useSyncExternalStore } from "react";
import { createSignal, getStoreRoot, type Signal } from "./signal";
import type { Resource } from "./resource";

export {
  batch,
  createMemo,
  createSignal,
  createStore,
  untrack,
} from "./signal";
export type { Memo, Signal, StoreSetter } from "./signal";

export { createResource } from "./resource";
export type {
  CreateResourceOptions,
  Resource,
  ResourceStatus,
} from "./resource";

export {
  createMoonshineApp as createApp,
  createMoonshineApp,
  renderToNode,
} from "./create-app";
export type { MoonshineApp, MoonshineAppOptions } from "./create-app";

type Listener = () => void;

type Readable<T> = {
  (): T;
  subscribe: (listener: Listener) => () => void;
  peek?: () => T;
};

/** React hook: re-render when a signal or memo changes. */
export function useSignal<T>(
  source: Readable<T>,
  getServerSnapshot?: () => T,
): T {
  const subscribe = (onStoreChange: () => void) =>
    source.subscribe(onStoreChange);
  const getSnapshot = () => source();
  const server =
    getServerSnapshot ??
    (() => (typeof source.peek === "function" ? source.peek!() : source()));
  return useSyncExternalStore(subscribe, getSnapshot, server);
}

/** React hook: re-render when a `createStore` proxy mutates. */
export function useStore<T extends object>(store: T): T {
  const node = getStoreRoot(store as object);
  if (!node) {
    throw new Error("useStore: expected a createStore() proxy");
  }
  useSyncExternalStore(
    node.subscribe,
    () => store,
    () => store,
  );
  return store;
}

/** Subscribe to a resource value + loading/error flags. */
export function useResource<T>(resource: Resource<T>): {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  status: ReturnType<Resource<T>["status"]>;
  refetch: () => Promise<T | undefined>;
} {
  const data = useSignal(resource);
  const loading = useSignal(resource.loading);
  const error = useSignal(resource.error);
  const status = useSignal(resource.status);
  return { data, loading, error, status, refetch: resource.refetch };
}

/**
 * Module-level signal for client islands.
 * Same as createSignal; named for host adapter docs / intent.
 */
export function createIslandSignal<T>(initial: T): Signal<T> {
  return createSignal(initial);
}
