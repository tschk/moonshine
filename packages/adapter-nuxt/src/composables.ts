/** Host-free Nuxt 3/4 state, async data, and macro composables on the Moonshine graph. */
import {
  createSignal as msCreateSignal,
  untrack,
  type Signal as MsSignal,
} from "@tschk/moonshine";
import { collectDeps, type Trackable } from "@tschk/moonshine/tracking";
import { getOwner, onCleanup, type Owner } from "@tschk/moonshine-dom/reactive";
import {
  getSSRRenderScope,
  isSSRRendering,
} from "@tschk/moonshine-dom/ssr-owner";

export type VueRef<T> = {
  get value(): T;
  set value(next: T);
};

const refSignals = new WeakMap<VueRef<any>, MsSignal<any>>();

export function isNuxtRef<T = any>(value: unknown): value is VueRef<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    refSignals.has(value as VueRef<any>)
  );
}

export function fromMoonshineSignal<T>(signal: MsSignal<T>): VueRef<T> {
  const ref: VueRef<T> = {
    get value() {
      return signal();
    },
    set value(next: T) {
      signal.set(() => next);
    },
  };
  refSignals.set(ref, signal);
  return ref;
}

export function createBridgedRef<T>(initial: T): VueRef<T> {
  return fromMoonshineSignal(msCreateSignal(initial));
}

type AsyncEntry = {
  data: VueRef<any>;
  pending: VueRef<boolean>;
  status: VueRef<AsyncDataRequestStatus>;
  error: VueRef<any>;
  refresh: (opts?: AsyncDataExecuteOptions) => Promise<void>;
  clear: () => void;
  inFlight?: Promise<void>;
  runId: number;
};

type NuxtScopeStore = {
  autoIndex: number;
  state: Map<string, VueRef<any>>;
  asyncData: Map<string, AsyncEntry>;
};

const scopeStores = new WeakMap<object, NuxtScopeStore>();
let fallbackStore: NuxtScopeStore = {
  autoIndex: 0,
  state: new Map(),
  asyncData: new Map(),
};

function resolveScopeStore(): NuxtScopeStore {
  const owner = getOwner();
  if (owner) {
    let root: Owner = owner;
    while (root.parent) {
      root = root.parent;
    }
    let store = scopeStores.get(root);
    if (!store) {
      store = { autoIndex: 0, state: new Map(), asyncData: new Map() };
      scopeStores.set(root, store);
    }
    return store;
  }
  const ssrScope = getSSRRenderScope();
  if (ssrScope) {
    let store = scopeStores.get(ssrScope);
    if (!store) {
      store = { autoIndex: 0, state: new Map(), asyncData: new Map() };
      scopeStores.set(ssrScope, store);
    }
    return store;
  }
  return fallbackStore;
}

function matchesKeyFilter(
  key: string,
  filter?: string | string[] | ((key: string) => boolean),
): boolean {
  if (filter === undefined) return true;
  if (typeof filter === "string") return key === filter;
  if (Array.isArray(filter)) return filter.includes(key);
  if (typeof filter === "function") return Boolean(filter(key));
  return false;
}

export function useState<T = any>(init?: () => T | VueRef<T>): VueRef<T>;
export function useState<T = any>(
  key: string,
  init?: () => T | VueRef<T>,
): VueRef<T>;
export function useState<T = any>(
  keyOrInit?: string | (() => T | VueRef<T>),
  maybeInit?: () => T | VueRef<T>,
): VueRef<T> {
  const store = resolveScopeStore();
  let key: string;
  let init: (() => T | VueRef<T>) | undefined;
  if (typeof keyOrInit === "string") {
    key = keyOrInit;
    init = maybeInit;
  } else if (typeof keyOrInit === "function" || keyOrInit === undefined) {
    key = `$s_${store.autoIndex++}`;
    init = keyOrInit;
  } else {
    throw new TypeError("useState key must be a string");
  }

  let existing = store.state.get(key);
  if (existing) {
    if (existing.value === undefined && init) {
      const initial = untrack(init);
      existing.value = isNuxtRef<T>(initial) ? initial.value : initial;
    }
    return existing as VueRef<T>;
  }

  const rawInitial = init ? untrack(init) : (undefined as T);
  const resolved = isNuxtRef<T>(rawInitial)
    ? rawInitial
    : createBridgedRef<T>(rawInitial);
  store.state.set(key, resolved);
  return resolved;
}

export function clearNuxtState(
  keys?: string | string[] | ((key: string) => boolean),
): void {
  const store = resolveScopeStore();
  for (const [key, ref] of Array.from(store.state.entries())) {
    if (matchesKeyFilter(key, keys)) {
      ref.value = undefined;
      store.state.delete(key);
    }
  }
}

export type AsyncDataRequestStatus = "idle" | "pending" | "success" | "error";

export interface AsyncDataExecuteOptions {
  dedupe?: "cancel" | "defer";
}

export interface AsyncDataOptions<ResT, DataT = ResT> {
  default?: () => DataT | VueRef<DataT> | null;
  transform?: (input: ResT) => DataT | Promise<DataT>;
  pick?: ReadonlyArray<keyof DataT>;
  watch?: ReadonlyArray<VueRef<any> | (() => any)>;
  immediate?: boolean;
  lazy?: boolean;
  server?: boolean;
  dedupe?: "cancel" | "defer";
}

export interface AsyncDataObject<DataT, ErrorT = Error> {
  data: VueRef<DataT | null>;
  pending: VueRef<boolean>;
  status: VueRef<AsyncDataRequestStatus>;
  error: VueRef<ErrorT | null>;
  refresh: (opts?: AsyncDataExecuteOptions) => Promise<void>;
  execute: (opts?: AsyncDataExecuteOptions) => Promise<void>;
  clear: () => void;
}

export type AsyncData<DataT, ErrorT = Error> = AsyncDataObject<DataT, ErrorT> &
  Promise<AsyncDataObject<DataT, ErrorT>>;

function getOrCreateAsyncEntry<DataT>(
  store: NuxtScopeStore,
  key: string,
  defaultFactory?: () => DataT | VueRef<DataT> | null,
): AsyncEntry {
  let entry = store.asyncData.get(key);
  if (!entry) {
    const rawDefault = defaultFactory ? untrack(defaultFactory) : null;
    const initialData = isNuxtRef<DataT>(rawDefault)
      ? rawDefault.value
      : (rawDefault ?? null);
    entry = {
      data: createBridgedRef<DataT | null>(initialData),
      pending: createBridgedRef(false),
      status: createBridgedRef<AsyncDataRequestStatus>("idle"),
      error: createBridgedRef<Error | null>(null),
      refresh: async () => {},
      clear: () => {},
      runId: 0,
    };
    store.asyncData.set(key, entry);
  } else if (entry.data.value === null && defaultFactory) {
    const rawDefault = untrack(defaultFactory);
    entry.data.value = isNuxtRef<DataT>(rawDefault)
      ? rawDefault.value
      : (rawDefault ?? null);
  }
  return entry;
}

export function useNuxtData<DataT = any>(
  key: string,
): { data: VueRef<DataT | null> } {
  if (typeof key !== "string" || !key) {
    throw new TypeError("useNuxtData requires a non-empty string key");
  }
  const store = resolveScopeStore();
  const entry = getOrCreateAsyncEntry<DataT>(store, key);
  return { data: entry.data };
}

export function useAsyncData<ResT, DataT = ResT, ErrorT = Error>(
  handler: () => Promise<ResT> | ResT,
  options?: AsyncDataOptions<ResT, DataT>,
): AsyncData<DataT, ErrorT>;
export function useAsyncData<ResT, DataT = ResT, ErrorT = Error>(
  key: string,
  handler: () => Promise<ResT> | ResT,
  options?: AsyncDataOptions<ResT, DataT>,
): AsyncData<DataT, ErrorT>;
export function useAsyncData<ResT, DataT = ResT, ErrorT = Error>(
  keyOrHandler: string | (() => Promise<ResT> | ResT),
  handlerOrOptions?:
    (() => Promise<ResT> | ResT) | AsyncDataOptions<ResT, DataT>,
  maybeOptions?: AsyncDataOptions<ResT, DataT>,
): AsyncData<DataT, ErrorT> {
  const store = resolveScopeStore();
  let key: string;
  let handler: () => Promise<ResT> | ResT;
  let options: AsyncDataOptions<ResT, DataT>;

  if (typeof keyOrHandler === "string") {
    key = keyOrHandler;
    if (typeof handlerOrOptions !== "function") {
      throw new TypeError("useAsyncData requires a handler function");
    }
    handler = handlerOrOptions;
    options = maybeOptions ?? {};
  } else if (typeof keyOrHandler === "function") {
    key = `$a_${store.autoIndex++}`;
    handler = keyOrHandler;
    options = (handlerOrOptions as AsyncDataOptions<ResT, DataT>) ?? {};
  } else {
    throw new TypeError("useAsyncData requires a key or handler function");
  }

  const entry = getOrCreateAsyncEntry<DataT>(store, key, options.default);

  const execute = async (opts?: AsyncDataExecuteOptions): Promise<void> => {
    const dedupe = opts?.dedupe ?? options.dedupe ?? "cancel";
    if (dedupe === "defer" && entry.inFlight) {
      return entry.inFlight;
    }
    const currentRun = ++entry.runId;
    entry.pending.value = true;
    entry.status.value = "pending";
    entry.error.value = null;

    const task = (async () => {
      try {
        const raw = await handler();
        let transformed: any = options.transform
          ? await options.transform(raw)
          : raw;
        if (
          options.pick &&
          transformed !== null &&
          typeof transformed === "object"
        ) {
          const picked: Partial<DataT> = {};
          for (const field of options.pick) {
            if (field in transformed) {
              picked[field] = transformed[field];
            }
          }
          transformed = picked;
        }
        if (currentRun === entry.runId) {
          entry.data.value = transformed as DataT;
          entry.pending.value = false;
          entry.status.value = "success";
        }
      } catch (err) {
        if (currentRun === entry.runId) {
          entry.error.value =
            err instanceof Error ? err : new Error(String(err));
          entry.pending.value = false;
          entry.status.value = "error";
        }
      } finally {
        if (currentRun === entry.runId) {
          entry.inFlight = undefined;
        }
      }
    })();

    entry.inFlight = task;
    return task;
  };

  const clear = () => {
    entry.runId++;
    entry.inFlight = undefined;
    const rawDefault = options.default ? untrack(options.default) : null;
    entry.data.value = isNuxtRef<DataT>(rawDefault)
      ? rawDefault.value
      : (rawDefault ?? null);
    entry.error.value = null;
    entry.pending.value = false;
    entry.status.value = "idle";
  };

  entry.refresh = execute;
  entry.clear = clear;

  if (options.watch && options.watch.length > 0 && !isSSRRendering()) {
    const watchSources = options.watch;
    let unsubs: Array<() => void> = [];
    const unsubscribeAll = () => {
      for (const unsub of unsubs.splice(0)) unsub();
    };
    const setupWatch = () => {
      unsubscribeAll();
      const versions = new Map<Trackable, number>();
      const deps = collectDeps(
        () => {
          for (const src of watchSources) {
            if (typeof src === "function") src();
            else if (isNuxtRef(src)) void src.value;
          }
        },
        (dep) => {
          versions.set(dep, dep.version);
        },
      );
      for (const dep of deps) {
        unsubs.push(
          dep.subscribe(() => {
            let changed = false;
            untrack(() => {
              for (const [trackedDep, prevVersion] of versions) {
                trackedDep.validate?.();
                if (trackedDep.version !== prevVersion) {
                  changed = true;
                  break;
                }
              }
            });
            if (changed) {
              setupWatch();
              void execute();
            }
          }),
        );
      }
    };
    setupWatch();
    if (getOwner()) {
      onCleanup(unsubscribeAll);
    }
  }

  const shouldRun =
    options.immediate !== false &&
    !(options.server === false && isSSRRendering());
  const initialPromise = shouldRun ? execute() : Promise.resolve();

  const baseResult: AsyncDataObject<DataT, ErrorT> = {
    data: entry.data,
    pending: entry.pending,
    status: entry.status,
    error: entry.error,
    refresh: execute,
    execute,
    clear,
  };

  const promise = initialPromise.then(() => baseResult);
  return Object.assign(promise, baseResult);
}

export function useLazyAsyncData<ResT, DataT = ResT, ErrorT = Error>(
  handler: () => Promise<ResT> | ResT,
  options?: Omit<AsyncDataOptions<ResT, DataT>, "lazy">,
): AsyncData<DataT, ErrorT>;
export function useLazyAsyncData<ResT, DataT = ResT, ErrorT = Error>(
  key: string,
  handler: () => Promise<ResT> | ResT,
  options?: Omit<AsyncDataOptions<ResT, DataT>, "lazy">,
): AsyncData<DataT, ErrorT>;
export function useLazyAsyncData<ResT, DataT = ResT, ErrorT = Error>(
  keyOrHandler: string | (() => Promise<ResT> | ResT),
  handlerOrOptions?:
    (() => Promise<ResT> | ResT) | Omit<AsyncDataOptions<ResT, DataT>, "lazy">,
  maybeOptions?: Omit<AsyncDataOptions<ResT, DataT>, "lazy">,
): AsyncData<DataT, ErrorT> {
  if (typeof keyOrHandler === "string") {
    return useAsyncData<ResT, DataT, ErrorT>(
      keyOrHandler,
      handlerOrOptions as () => Promise<ResT> | ResT,
      { ...maybeOptions, lazy: true },
    );
  }
  return useAsyncData<ResT, DataT, ErrorT>(keyOrHandler, {
    ...(handlerOrOptions as Omit<AsyncDataOptions<ResT, DataT>, "lazy">),
    lazy: true,
  });
}

export async function refreshNuxtData(keys?: string | string[]): Promise<void> {
  const store = resolveScopeStore();
  const tasks: Promise<void>[] = [];
  for (const [key, entry] of store.asyncData.entries()) {
    if (matchesKeyFilter(key, keys)) {
      tasks.push(entry.refresh());
    }
  }
  await Promise.all(tasks);
}

export function clearNuxtData(
  keys?: string | string[] | ((key: string) => boolean),
): void {
  const store = resolveScopeStore();
  for (const [key, entry] of Array.from(store.asyncData.entries())) {
    if (matchesKeyFilter(key, keys)) {
      entry.clear();
      store.asyncData.delete(key);
    }
  }
}

export function definePageMeta<T extends Record<string, any>>(meta: T): T {
  return meta;
}

export function defineNuxtPlugin<T extends (...args: any[]) => any>(
  plugin: T,
): T {
  return plugin;
}

export function defineNuxtRouteMiddleware<T extends (...args: any[]) => any>(
  middleware: T,
): T {
  return middleware;
}
