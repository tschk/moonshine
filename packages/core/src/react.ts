/**
 * React bridge for `@tschk/moonshine`.
 *
 * ```ts
 * import { createApp, useSignal, createSignal } from "@tschk/moonshine/react";
 * ```
 */
import { useSyncExternalStore } from "react";
import { getStoreRoot } from "./signal";

export {
  batch,
  createMemo,
  createSignal,
  createStore,
} from "./signal";
export type { Memo, Signal, StoreSetter } from "./signal";

export {
  createMoonshineApp as createApp,
  createMoonshineApp,
  renderToNode,
} from "./create-app";
export type { MoonshineApp, MoonshineAppOptions } from "./create-app";

type Listener = () => void;

/** React hook: re-render when a signal or memo changes. */
export function useSignal<T>(source: {
  (): T;
  subscribe: (listener: Listener) => () => void;
}): T {
  const subscribe = (onStoreChange: () => void) => source.subscribe(onStoreChange);
  const getSnapshot = () => source();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** React hook: re-render when a `createStore` proxy mutates. */
export function useStore<T extends object>(store: T): T {
  const node = getStoreRoot(store as object);
  if (!node) {
    throw new Error("useStore: expected a createStore() proxy");
  }
  useSyncExternalStore(node.subscribe, () => store, () => store);
  return store;
}
