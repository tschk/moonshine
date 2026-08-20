import {
  createElement,
  useCallback,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  batch,
  createMemo,
  createSignal,
  createStore,
  getStoreRoot,
  untrack,
  type Memo,
  type Signal,
  type StoreSetter,
} from "@tschk/moonshine";
import {
  createResource,
  type CreateResourceOptions,
  type Resource,
  type ResourceStatus,
} from "@tschk/moonshine";

export type MoonshineAppOptions = {
  root: ComponentType;
  className?: string;
};

export type MoonshineApp = {
  mount: (container: string | Element) => void;
  unmount: () => void;
  readonly mounted: boolean;
};

export function createMoonshineApp(options: MoonshineAppOptions): MoonshineApp {
  let reactRoot: Root | null = null;
  let host: Element | null = null;
  let mounted = false;

  return {
    get mounted() {
      return mounted;
    },
    mount(container) {
      if (mounted) {
        throw new Error("createMoonshineApp: already mounted");
      }

      const el =
        typeof container === "string"
          ? document.querySelector(container)
          : container;
      if (!el) {
        throw new Error(
          `createMoonshineApp: mount target not found: ${String(container)}`,
        );
      }

      host = el;
      if (options.className) {
        el.classList.add(...options.className.split(/\s+/).filter(Boolean));
      }

      reactRoot = createRoot(el);
      reactRoot.render(<options.root />);
      mounted = true;
    },
    unmount() {
      if (!mounted || !reactRoot) return;
      reactRoot.unmount();
      reactRoot = null;
      if (host && options.className) {
        for (const cls of options.className.split(/\s+/).filter(Boolean)) {
          host.classList.remove(cls);
        }
      }
      host = null;
      mounted = false;
    },
  };
}

export const createApp = createMoonshineApp;

type Subscribable<T> = (() => T) & {
  subscribe: (listener: () => void) => () => void;
  peek?: () => T;
};

export function useSignal<T>(
  source: Subscribable<T>,
  getServerSnapshot?: () => T,
): T {
  // A fresh `subscribe` identity makes useSyncExternalStore resubscribe on
  // every render, and dropping a memo's last listener tears down its whole
  // upstream chain, so keep it stable for as long as the source is.
  const subscribe = useCallback(
    (onStoreChange: () => void) => source.subscribe(onStoreChange),
    [source],
  );
  const getSnapshot = useCallback(() => source(), [source]);
  const server =
    getServerSnapshot ??
    (() =>
      typeof source.peek === "function"
        ? (source.peek as () => T)()
        : source());
  return useSyncExternalStore(subscribe, getSnapshot, server);
}

export function useStore<T extends object>(store: T): T {
  const node = getStoreRoot(store as object);
  if (!node) {
    throw new Error("useStore: expected a createStore() proxy");
  }
  useSyncExternalStore(
    node.subscribe,
    () => node.version,
    () => node.version,
  );
  return store;
}

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

export function createIslandSignal<T>(initial: T): Signal<T> {
  return createSignal(initial);
}

export function renderToNode(root: ComponentType): ReactNode {
  return createElement(root);
}

export {
  batch,
  createMemo,
  createResource,
  createSignal,
  createStore,
  untrack,
};
export type {
  CreateResourceOptions,
  Memo,
  Resource,
  ResourceStatus,
  Signal,
  StoreSetter,
};
