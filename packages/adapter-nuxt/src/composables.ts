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

export interface NuxtRuntimeConfig {
  app: {
    baseURL: string;
    buildAssetsDir: string;
    cdnURL: string;
    [key: string]: any;
  };
  public: Record<string, any>;
  [key: string]: any;
}

export interface NuxtRequestEvent {
  request: Request;
  url: URL;
  headers: Headers;
  responseHeaders: Headers;
  responseStatus: number;
  responseStatusText?: string;
  context: Record<string, any>;
}

export interface NuxtRequestInit {
  request?: Request;
  url?: URL | string;
  headers?: HeadersInit;
  responseHeaders?: HeadersInit;
  responseStatus?: number;
  responseStatusText?: string;
  context?: Record<string, any>;
  runtimeConfig?: Partial<NuxtRuntimeConfig>;
  appConfig?: Record<string, any>;
}

type CookieEntry = {
  ref: VueRef<any>;
  decode: (raw: string) => any;
  defaultFactory?: () => any;
};

type HeadEntryRecord = {
  id: number;
  signal: MsSignal<MaybeReactive<HeadInput>>;
};

type NuxtScopeStore = {
  autoIndex: number;
  state: Map<string, VueRef<any>>;
  asyncData: Map<string, AsyncEntry>;
  cookies: Map<string, CookieEntry>;
  callOnceDone: Set<string>;
  callOnceInFlight: Map<string, Promise<void>>;
  error?: VueRef<NuxtError<any> | undefined>;
  runtimeConfig: NuxtRuntimeConfig;
  appConfigSignal: MsSignal<Record<string, any>>;
  appConfigProxy?: Record<string, any>;
  routeSignal?: MsSignal<NuxtRouteLocation>;
  routeProxy?: NuxtRouteLocation;
  router?: NuxtRouter;
  routes: Map<string | symbol, NuxtRouteRecord>;
  beforeGuards: Set<NavigationGuard>;
  updateGuards: Set<NavigationGuard>;
  leaveGuards: Set<NavigationGuard>;
  globalMiddlewares: Set<NavigationGuard>;
  namedMiddlewares: Map<string, NavigationGuard>;
  afterHooks: Set<AfterNavigationHook>;
  errorHandlers: Set<(error: unknown) => void>;
  headEntries: HeadEntryRecord[];
  nextHeadId: number;
  preloadedComponents: Set<string>;
  prefetchedComponents: Set<string>;
  preloadedRoutes: Set<string>;
  nuxtApp?: NuxtApp;
  loadingIndicator?: LoadingIndicator;
  routeAnnouncer?: RouteAnnouncer;
  prehydrateCallbacks: Map<string, string>;
  reloadHistory: ReloadNuxtAppOptions[];
  payloadReducers: Map<string, (data: any) => any>;
  payloadRevivers: Map<string, (data: any) => any>;
  event?: NuxtRequestEvent;
};

function createDefaultRuntimeConfig(
  overrides?: Partial<NuxtRuntimeConfig>,
): NuxtRuntimeConfig {
  return {
    ...overrides,
    app: {
      baseURL: "/",
      buildAssetsDir: "/_nuxt/",
      cdnURL: "",
      ...overrides?.app,
    },
    public: {
      ...overrides?.public,
    },
  };
}

function createScopeStore(
  init?: NuxtRequestInit,
  event?: NuxtRequestEvent,
): NuxtScopeStore {
  return {
    autoIndex: 0,
    state: new Map(),
    asyncData: new Map(),
    cookies: new Map(),
    callOnceDone: new Set(),
    callOnceInFlight: new Map(),
    runtimeConfig: createDefaultRuntimeConfig(init?.runtimeConfig),
    appConfigSignal: msCreateSignal<Record<string, any>>(
      init?.appConfig ? { ...init.appConfig } : {},
    ),
    routes: new Map(),
    beforeGuards: new Set(),
    updateGuards: new Set(),
    leaveGuards: new Set(),
    globalMiddlewares: new Set(),
    namedMiddlewares: new Map(),
    afterHooks: new Set(),
    errorHandlers: new Set(),
    headEntries: [],
    nextHeadId: 1,
    preloadedComponents: new Set(),
    prefetchedComponents: new Set(),
    preloadedRoutes: new Set(),
    prehydrateCallbacks: new Map(),
    reloadHistory: [],
    payloadReducers: new Map(),
    payloadRevivers: new Map(),
    event,
  };
}

const scopeStores = new WeakMap<object, NuxtScopeStore>();
let activeRequestStore: NuxtScopeStore | undefined;
let fallbackStore: NuxtScopeStore = createScopeStore();

function resolveScopeStore(): NuxtScopeStore {
  if (activeRequestStore) {
    return activeRequestStore;
  }
  const owner = getOwner();
  if (owner) {
    let root: Owner = owner;
    while (root.parent) {
      root = root.parent;
    }
    let store = scopeStores.get(root);
    if (!store) {
      store = createScopeStore();
      scopeStores.set(root, store);
    }
    return store;
  }
  const ssrScope = getSSRRenderScope();
  if (ssrScope) {
    let store = scopeStores.get(ssrScope);
    if (!store) {
      store = createScopeStore();
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

export function defineAppConfig<T extends Record<string, any>>(config: T): T {
  return config;
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

export interface AddRouteMiddlewareOptions {
  global?: boolean;
}

export function addRouteMiddleware(
  name: string,
  middleware: NavigationGuard,
  options?: AddRouteMiddlewareOptions,
): void;
export function addRouteMiddleware(
  middleware: NavigationGuard,
  options?: AddRouteMiddlewareOptions,
): void;
export function addRouteMiddleware(
  nameOrMiddleware: string | NavigationGuard,
  middlewareOrOptions?: NavigationGuard | AddRouteMiddlewareOptions,
  maybeOptions?: AddRouteMiddlewareOptions,
): void {
  const store = resolveScopeStore();
  if (typeof nameOrMiddleware === "string") {
    if (typeof middlewareOrOptions !== "function") {
      throw new TypeError("addRouteMiddleware requires a middleware function");
    }
    store.namedMiddlewares.set(nameOrMiddleware, middlewareOrOptions);
    if (maybeOptions?.global) {
      store.globalMiddlewares.add(middlewareOrOptions);
    }
    return;
  }
  if (typeof nameOrMiddleware === "function") {
    store.globalMiddlewares.add(nameOrMiddleware);
    return;
  }
  throw new TypeError(
    "addRouteMiddleware requires a name or middleware function",
  );
}

export function isNuxtRequestEvent(value: unknown): value is NuxtRequestEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "request" in value &&
    (value as NuxtRequestEvent).request instanceof Request &&
    "responseHeaders" in value &&
    (value as NuxtRequestEvent).responseHeaders instanceof Headers
  );
}

export function createNuxtRequestEvent(
  init?: Request | NuxtRequestInit | NuxtRequestEvent,
): NuxtRequestEvent {
  if (isNuxtRequestEvent(init)) {
    return init;
  }
  if (init instanceof Request) {
    return {
      request: init,
      url: new URL(init.url),
      headers: new Headers(init.headers),
      responseHeaders: new Headers(),
      responseStatus: 200,
      context: {},
    };
  }
  const resolvedUrl =
    init?.url instanceof URL
      ? init.url
      : typeof init?.url === "string"
        ? new URL(init.url, "http://localhost")
        : init?.request
          ? new URL(init.request.url)
          : new URL("http://localhost/");
  const headers = new Headers(init?.headers ?? init?.request?.headers);
  const request = init?.request ?? new Request(resolvedUrl.href, { headers });
  const responseHeaders = new Headers(init?.responseHeaders);
  return {
    request,
    url: resolvedUrl,
    headers,
    responseHeaders,
    responseStatus: init?.responseStatus ?? 200,
    responseStatusText: init?.responseStatusText,
    context: init?.context ? { ...init.context } : {},
  };
}

export function withNuxtRequest<T>(
  initOrEvent: Request | NuxtRequestInit | NuxtRequestEvent,
  fn: (event: NuxtRequestEvent) => T,
): T {
  const event = createNuxtRequestEvent(initOrEvent);
  const initObj =
    !(initOrEvent instanceof Request) && !isNuxtRequestEvent(initOrEvent)
      ? initOrEvent
      : undefined;
  const store = createScopeStore(initObj, event);
  const previous = activeRequestStore;
  activeRequestStore = store;
  try {
    const result = fn(event);
    if (
      result !== null &&
      typeof result === "object" &&
      typeof (result as { then?: unknown }).then === "function"
    ) {
      return Promise.resolve(result).finally(() => {
        if (activeRequestStore === store) {
          activeRequestStore = previous;
        }
      }) as T;
    }
    activeRequestStore = previous;
    return result;
  } catch (err) {
    activeRequestStore = previous;
    throw err;
  }
}

export function useRequestEvent(): NuxtRequestEvent | undefined {
  return resolveScopeStore().event;
}

export function useRequestHeaders<K extends string = string>(
  include?: readonly K[],
): Record<Lowercase<K>, string | undefined> {
  const event = resolveScopeStore().event;
  const result = {} as Record<Lowercase<K>, string | undefined>;
  if (!event) return result;
  if (include && include.length > 0) {
    for (const key of include) {
      const lower = key.toLowerCase() as Lowercase<K>;
      const val = event.headers.get(lower);
      if (val !== null) {
        result[lower] = val;
      }
    }
    return result;
  }
  event.headers.forEach((value, key) => {
    result[key.toLowerCase() as Lowercase<K>] = value;
  });
  return result;
}

export function useRequestURL(): URL {
  const event = resolveScopeStore().event;
  if (event) {
    return new URL(event.url.href);
  }
  if (typeof window !== "undefined" && window.location?.href) {
    return new URL(window.location.href);
  }
  return new URL("http://localhost/");
}

export interface CookieOptions<T = any> {
  default?: () => T | VueRef<T>;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  domain?: string;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none" | "Lax" | "Strict" | "None";
  encode?: (value: T) => string;
  decode?: (value: string) => T;
  readonly?: boolean;
  watch?: boolean | "shallow";
}

export type CookieRef<T> = VueRef<T>;

function defaultDecodeCookie<T>(raw: string): T {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (decoded === "true") return true as unknown as T;
  if (decoded === "false") return false as unknown as T;
  if (decoded === "null") return null as unknown as T;
  if (decoded === "undefined") return undefined as unknown as T;
  if (/^-?\d+(\.\d+)?$/.test(decoded)) {
    const num = Number(decoded);
    if (Number.isSafeInteger(num) || !Number.isNaN(num)) {
      return num as unknown as T;
    }
  }
  if (
    (decoded.startsWith("{") && decoded.endsWith("}")) ||
    (decoded.startsWith("[") && decoded.endsWith("]"))
  ) {
    try {
      return JSON.parse(decoded) as T;
    } catch {
      return decoded as unknown as T;
    }
  }
  return decoded as unknown as T;
}

function defaultEncodeCookie<T>(value: T): string {
  if (typeof value === "string") {
    return encodeURIComponent(value);
  }
  return encodeURIComponent(JSON.stringify(value));
}

export function parseRawCookies(cookieString: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieString) return map;
  for (const part of cookieString.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (!key) continue;
    let val = part.slice(eqIdx + 1).trim();
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    if (!map.has(key)) {
      map.set(key, val);
    }
  }
  return map;
}

export function formatSetCookieHeader<T>(
  name: string,
  value: T | null | undefined,
  options: CookieOptions<T> = {},
): string {
  const isDeleted = value === null || value === undefined;
  const encode = options.encode ?? defaultEncodeCookie;
  const encodedVal = isDeleted ? "" : encode(value);
  const parts = [`${name}=${encodedVal}`];
  const path = options.path ?? "/";
  if (isDeleted) {
    parts.push("Max-Age=0");
  } else if (options.maxAge !== undefined && Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.trunc(options.maxAge)}`);
  }
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (path) parts.push(`Path=${path}`);
  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite !== undefined && options.sameSite !== false) {
    const mode =
      options.sameSite === true
        ? "Strict"
        : options.sameSite.charAt(0).toUpperCase() +
          options.sameSite.slice(1).toLowerCase();
    parts.push(`SameSite=${mode}`);
  }
  return parts.join("; ");
}

function readRawCookieSource(store: NuxtScopeStore): string {
  if (store.event) {
    return store.event.headers.get("cookie") ?? "";
  }
  if (typeof document !== "undefined" && typeof document.cookie === "string") {
    return document.cookie;
  }
  return "";
}

export function useCookie<T = string | null | undefined>(
  name: string,
  options: CookieOptions<T> = {},
): CookieRef<T> {
  const store = resolveScopeStore();
  const existing = store.cookies.get(name);
  if (existing) {
    if (existing.ref.value === undefined && options.default) {
      const def = untrack(options.default);
      existing.ref.value = isNuxtRef<T>(def) ? def.value : def;
    }
    return existing.ref as CookieRef<T>;
  }

  const decode = options.decode ?? defaultDecodeCookie<T>;
  const rawMap = parseRawCookies(readRawCookieSource(store));
  let initialValue: T;
  if (rawMap.has(name)) {
    initialValue = decode(rawMap.get(name)!);
  } else if (options.default) {
    const rawDef = untrack(options.default);
    initialValue = isNuxtRef<T>(rawDef) ? rawDef.value : rawDef;
  } else {
    initialValue = undefined as unknown as T;
  }

  const sig = msCreateSignal<T>(initialValue);
  const writeCookieOut = (next: T) => {
    const header = formatSetCookieHeader(name, next, options);
    if (store.event) {
      store.event.responseHeaders.append("Set-Cookie", header);
    } else if (typeof document !== "undefined") {
      document.cookie = header;
    }
  };

  const ref: CookieRef<T> = {
    get value() {
      return sig();
    },
    set value(next: T) {
      if (options.readonly) return;
      sig.set(() => next);
      if (options.watch !== false) {
        writeCookieOut(next);
      }
    },
  };
  refSignals.set(ref, sig);
  store.cookies.set(name, {
    ref,
    decode,
    defaultFactory: options.default,
  });
  return ref;
}

export function refreshCookie(name: string): void {
  const store = resolveScopeStore();
  const entry = store.cookies.get(name);
  if (!entry) return;
  const rawMap = parseRawCookies(readRawCookieSource(store));
  const sig = refSignals.get(entry.ref);
  if (!sig) return;
  if (rawMap.has(name)) {
    const next = entry.decode(rawMap.get(name)!);
    sig.set(() => next);
  } else if (entry.defaultFactory) {
    const rawDef = untrack(entry.defaultFactory);
    const next = isNuxtRef(rawDef) ? rawDef.value : rawDef;
    sig.set(() => next);
  } else {
    sig.set(() => undefined);
  }
}

export type MaybeReactive<T> = T | VueRef<T> | (() => T);

function resolveReactive<T>(
  input: MaybeReactive<T> | undefined,
): T | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "function") return (input as () => T)();
  if (isNuxtRef<T>(input)) return input.value;
  return input;
}

export interface FetchContext {
  request: string;
  options: RequestInit;
  response?: Response;
  error?: Error;
}

export interface UseFetchOptions<ResT, DataT = ResT> extends AsyncDataOptions<
  ResT,
  DataT
> {
  key?: string;
  method?: MaybeReactive<string>;
  query?: MaybeReactive<Record<string, any>>;
  params?: MaybeReactive<Record<string, any>>;
  body?: MaybeReactive<RequestInit["body"] | Record<string, any> | null>;
  headers?: MaybeReactive<HeadersInit>;
  baseURL?: MaybeReactive<string>;
  timeout?: number;
  $fetch?: (url: string, init: RequestInit) => Promise<ResT>;
  onRequest?: (context: FetchContext) => void | Promise<void>;
  onRequestError?: (
    context: FetchContext & { error: Error },
  ) => void | Promise<void>;
  onResponse?: (
    context: FetchContext & { response: Response },
  ) => void | Promise<void>;
  onResponseError?: (
    context: FetchContext & { response: Response },
  ) => void | Promise<void>;
}

function buildFetchUrl(
  rawUrl: string | Request | URL,
  baseURL?: string,
  query?: Record<string, any>,
  params?: Record<string, any>,
): string {
  const baseStr =
    rawUrl instanceof Request
      ? rawUrl.url
      : rawUrl instanceof URL
        ? rawUrl.href
        : String(rawUrl);
  const fullPath = baseURL
    ? `${baseURL.replace(/\/+$/, "")}/${baseStr.replace(/^\/+/, "")}`
    : baseStr;
  const mergedQuery = { ...params, ...query };
  const entries = Object.entries(mergedQuery).filter(
    ([, val]) => val !== undefined && val !== null,
  );
  if (entries.length === 0) return fullPath;
  const searchParams = new URLSearchParams();
  for (const [k, v] of entries) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null) {
          searchParams.append(k, String(item));
        }
      }
    } else {
      searchParams.append(k, String(v));
    }
  }
  const qs = searchParams.toString();
  if (!qs) return fullPath;
  return fullPath.includes("?") ? `${fullPath}&${qs}` : `${fullPath}?${qs}`;
}

export function useFetch<ResT = any, DataT = ResT, ErrorT = Error>(
  request: MaybeReactive<string | Request | URL>,
  options: UseFetchOptions<ResT, DataT> = {},
): AsyncData<DataT, ErrorT> {
  const initialUrl = untrack(() =>
    buildFetchUrl(
      resolveReactive(request) ?? "/",
      resolveReactive(options.baseURL),
      resolveReactive(options.query),
      resolveReactive(options.params),
    ),
  );
  const initialMethod = (
    untrack(() => resolveReactive(options.method)) ?? "GET"
  ).toUpperCase();
  const key = options.key ?? `$f_${initialMethod}_${initialUrl}`;

  const reactiveSources: Array<VueRef<any> | (() => any)> = [
    ...(options.watch ?? []),
  ];
  for (const candidate of [
    request,
    options.method,
    options.query,
    options.params,
    options.body,
    options.headers,
    options.baseURL,
  ]) {
    if (typeof candidate === "function" || isNuxtRef(candidate)) {
      reactiveSources.push(candidate as VueRef<any> | (() => any));
    }
  }

  return useAsyncData<ResT, DataT, ErrorT>(
    key,
    async () => {
      const targetUrl = buildFetchUrl(
        resolveReactive(request) ?? "/",
        resolveReactive(options.baseURL),
        resolveReactive(options.query),
        resolveReactive(options.params),
      );
      const method = (resolveReactive(options.method) ?? "GET").toUpperCase();
      const headers = new Headers(resolveReactive(options.headers));
      const rawBody = resolveReactive(options.body);
      let body: RequestInit["body"] | undefined;
      if (rawBody !== undefined && rawBody !== null) {
        if (
          typeof rawBody === "string" ||
          rawBody instanceof FormData ||
          rawBody instanceof URLSearchParams ||
          rawBody instanceof Blob ||
          rawBody instanceof ArrayBuffer ||
          ArrayBuffer.isView(rawBody)
        ) {
          body = rawBody as RequestInit["body"];
        } else {
          if (!headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }
          body = JSON.stringify(rawBody);
        }
      }

      const controller =
        options.timeout !== undefined ? new AbortController() : undefined;
      const timer =
        controller && options.timeout !== undefined
          ? setTimeout(() => controller.abort(), options.timeout)
          : undefined;

      const reqInit: RequestInit = {
        method,
        headers,
        body,
        signal: controller?.signal,
      };
      const ctx: FetchContext = { request: targetUrl, options: reqInit };

      try {
        if (options.onRequest) {
          await options.onRequest(ctx);
        }
        if (options.$fetch) {
          return await options.$fetch(ctx.request, ctx.options);
        }
        const response = await fetch(ctx.request, ctx.options);
        ctx.response = response;
        if (!response.ok) {
          if (options.onResponseError) {
            await options.onResponseError(
              ctx as FetchContext & { response: Response },
            );
          }
          throw new Error(
            `Fetch failed with status ${response.status} (${response.statusText || "HTTP Error"})`,
          );
        }
        if (options.onResponse) {
          await options.onResponse(
            ctx as FetchContext & { response: Response },
          );
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          return (await response.json()) as ResT;
        }
        return (await response.text()) as unknown as ResT;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        ctx.error = error;
        if (!ctx.response && options.onRequestError) {
          await options.onRequestError(ctx as FetchContext & { error: Error });
        }
        throw error;
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
    },
    {
      ...options,
      watch: reactiveSources,
    },
  );
}

export function useLazyFetch<ResT = any, DataT = ResT, ErrorT = Error>(
  request: MaybeReactive<string | Request | URL>,
  options: Omit<UseFetchOptions<ResT, DataT>, "lazy"> = {},
): AsyncData<DataT, ErrorT> {
  return useFetch<ResT, DataT, ErrorT>(request, { ...options, lazy: true });
}

export function useRuntimeConfig(): NuxtRuntimeConfig {
  return resolveScopeStore().runtimeConfig;
}

function deepMergeConfig(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof out[key] === "object" &&
      out[key] !== null &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMergeConfig(out[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function useAppConfig<
  T extends Record<string, any> = Record<string, any>,
>(): T {
  const store = resolveScopeStore();
  if (!store.appConfigProxy) {
    store.appConfigProxy = new Proxy(
      {},
      {
        get(_target, prop) {
          const current = store.appConfigSignal();
          return Reflect.get(current, prop);
        },
        set(_target, prop, value) {
          const current = untrack(store.appConfigSignal);
          store.appConfigSignal.set(() => ({
            ...current,
            [prop]: value,
          }));
          return true;
        },
        has(_target, prop) {
          const current = store.appConfigSignal();
          return prop in current;
        },
        ownKeys() {
          const current = store.appConfigSignal();
          return Reflect.ownKeys(current);
        },
        getOwnPropertyDescriptor(_target, prop) {
          const current = store.appConfigSignal();
          const desc = Reflect.getOwnPropertyDescriptor(current, prop);
          if (desc) return { ...desc, configurable: true };
          return undefined;
        },
      },
    );
  }
  return store.appConfigProxy as T;
}

export function updateAppConfig(patch: Record<string, any>): void {
  const store = resolveScopeStore();
  const current = untrack(store.appConfigSignal);
  const merged = deepMergeConfig(current, patch);
  store.appConfigSignal.set(() => merged);
}

export class NuxtError<DataT = unknown> extends Error {
  readonly __nuxt_error = true;
  statusCode: number;
  statusMessage?: string;
  data?: DataT;
  fatal: boolean;
  unhandled: boolean;

  constructor(
    input:
      | string
      | {
          message?: string;
          statusCode?: number;
          status?: number;
          statusMessage?: string;
          statusText?: string;
          data?: DataT;
          fatal?: boolean;
          unhandled?: boolean;
          cause?: unknown;
          stack?: string;
        },
  ) {
    const opts = typeof input === "string" ? { message: input } : input;
    const statusCode = opts.statusCode ?? opts.status ?? 500;
    const statusMessage = opts.statusMessage ?? opts.statusText;
    super(opts.message ?? statusMessage ?? `HTTP Error ${statusCode}`, {
      cause: opts.cause,
    });
    this.name = "NuxtError";
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.data = opts.data;
    this.fatal = opts.fatal ?? false;
    this.unhandled = opts.unhandled ?? false;
    if (opts.stack) {
      this.stack = opts.stack;
    }
  }

  toJSON(): {
    message: string;
    statusCode: number;
    statusMessage?: string;
    data?: DataT;
  } {
    return {
      message: this.message,
      statusCode: this.statusCode,
      ...(this.statusMessage !== undefined
        ? { statusMessage: this.statusMessage }
        : {}),
      ...(this.data !== undefined ? { data: this.data } : {}),
    };
  }
}

export function isNuxtError<DataT = unknown>(
  error: unknown,
): error is NuxtError<DataT> {
  return (
    error instanceof NuxtError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { __nuxt_error?: unknown }).__nuxt_error === true)
  );
}

export function createError<DataT = unknown>(
  input:
    | string
    | {
        message?: string;
        statusCode?: number;
        status?: number;
        statusMessage?: string;
        statusText?: string;
        data?: DataT;
        fatal?: boolean;
        unhandled?: boolean;
        cause?: unknown;
        stack?: string;
      },
): NuxtError<DataT> {
  if (isNuxtError<DataT>(input)) return input;
  return new NuxtError<DataT>(input);
}

export function useError<DataT = unknown>(): VueRef<
  NuxtError<DataT> | undefined
> {
  const store = resolveScopeStore();
  if (!store.error) {
    store.error = createBridgedRef<NuxtError<any> | undefined>(undefined);
  }
  return store.error as VueRef<NuxtError<DataT> | undefined>;
}

export function showError<DataT = unknown>(
  input:
    | string
    | Error
    | {
        message?: string;
        statusCode?: number;
        status?: number;
        statusMessage?: string;
        statusText?: string;
        data?: DataT;
        fatal?: boolean;
      },
): NuxtError<DataT> {
  const err = isNuxtError<DataT>(input)
    ? input
    : input instanceof Error
      ? new NuxtError<DataT>({
          message: input.message,
          stack: input.stack,
          cause: input.cause,
        })
      : createError<DataT>(input);
  useError<DataT>().value = err;
  return err;
}

export async function clearError(options?: {
  redirect?: string;
}): Promise<void> {
  useError().value = undefined;
  if (options?.redirect) {
    await navigateTo(options.redirect, { replace: true });
  }
}

export interface CallOnceOptions {
  mode?: "navigation" | "render";
}

export async function callOnce(
  fn: () => any | Promise<any>,
  options?: CallOnceOptions,
): Promise<void>;
export async function callOnce(
  key: string,
  fn: () => any | Promise<any>,
  options?: CallOnceOptions,
): Promise<void>;
export async function callOnce(
  keyOrFn: string | (() => any | Promise<any>),
  fnOrOptions?: (() => any | Promise<any>) | CallOnceOptions,
  maybeOptions?: CallOnceOptions,
): Promise<void> {
  const store = resolveScopeStore();
  let key: string;
  let fn: () => any | Promise<any>;
  let options: CallOnceOptions | undefined;

  if (typeof keyOrFn === "string") {
    key = keyOrFn;
    if (typeof fnOrOptions !== "function") {
      throw new TypeError("callOnce requires a callback function");
    }
    fn = fnOrOptions;
    options = maybeOptions;
  } else if (typeof keyOrFn === "function") {
    key = `$once_${fnToKey(keyOrFn)}`;
    fn = keyOrFn;
    options = fnOrOptions as CallOnceOptions | undefined;
  } else {
    throw new TypeError("callOnce requires a key or callback function");
  }

  if (options?.mode !== "navigation" && store.callOnceDone.has(key)) {
    return;
  }
  const existing = store.callOnceInFlight.get(key);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    try {
      await fn();
      store.callOnceDone.add(key);
    } finally {
      store.callOnceInFlight.delete(key);
    }
  })();
  store.callOnceInFlight.set(key, task);
  return task;
}

const fnKeyIds = new WeakMap<Function, number>();
let nextFnKeyId = 1;
function fnToKey(fn: Function): number {
  let id = fnKeyIds.get(fn);
  if (!id) {
    id = nextFnKeyId++;
    fnKeyIds.set(fn, id);
  }
  return id;
}

export function setResponseStatus(
  event: NuxtRequestEvent,
  code?: number,
  message?: string,
): void;
export function setResponseStatus(code: number, message?: string): void;
export function setResponseStatus(
  eventOrCode: NuxtRequestEvent | number,
  codeOrMessage?: number | string,
  maybeMessage?: string,
): void {
  if (typeof eventOrCode === "number") {
    const event = resolveScopeStore().event;
    if (!event) return;
    event.responseStatus = eventOrCode;
    if (typeof codeOrMessage === "string") {
      event.responseStatusText = codeOrMessage;
    }
    return;
  }
  if (isNuxtRequestEvent(eventOrCode)) {
    if (typeof codeOrMessage === "number") {
      eventOrCode.responseStatus = codeOrMessage;
    }
    if (typeof maybeMessage === "string") {
      eventOrCode.responseStatusText = maybeMessage;
    }
  }
}

export interface NuxtRouteRecord {
  path: string;
  name?: string | symbol;
  meta?: Record<string, any>;
  component?: unknown;
  children?: NuxtRouteRecord[];
}

export interface NuxtRouteLocation {
  path: string;
  fullPath: string;
  query: Record<string, string | string[]>;
  hash: string;
  params: Record<string, string | string[]>;
  name?: string | symbol | null;
  meta: Record<string, any>;
  matched: NuxtRouteRecord[];
  redirectedFrom?: NuxtRouteLocation;
}

export type NuxtRouteLocationRaw =
  | string
  | {
      path?: string;
      name?: string | symbol;
      query?: Record<string, any>;
      params?: Record<string, any>;
      hash?: string;
      replace?: boolean;
      meta?: Record<string, any>;
    };

export interface NavigationAbort {
  readonly __nuxt_abort: true;
  readonly error?: NuxtError;
}

export interface NavigationFailure extends Error {
  readonly __nuxt_nav_failure: true;
  readonly from: NuxtRouteLocation;
  readonly to: NuxtRouteLocation;
  readonly type: "aborted" | "cancelled" | "duplicated";
}

export type NavigationGuardReturn =
  | void
  | undefined
  | boolean
  | string
  | NuxtRouteLocationRaw
  | NavigationAbort
  | Error;

export type NavigationGuard = (
  to: NuxtRouteLocation,
  from: NuxtRouteLocation,
) => NavigationGuardReturn | Promise<NavigationGuardReturn>;

export type AfterNavigationHook = (
  to: NuxtRouteLocation,
  from: NuxtRouteLocation,
  failure?: NavigationFailure,
) => void | Promise<void>;

export interface NuxtRouter {
  currentRoute: VueRef<NuxtRouteLocation>;
  resolve: (to: NuxtRouteLocationRaw) => NuxtRouteLocation;
  push: (
    to: NuxtRouteLocationRaw,
  ) => Promise<NuxtRouteLocation | NavigationFailure | void>;
  replace: (
    to: NuxtRouteLocationRaw,
  ) => Promise<NuxtRouteLocation | NavigationFailure | void>;
  back: () => void;
  forward: () => void;
  go: (delta: number) => void;
  beforeEach: (guard: NavigationGuard) => () => void;
  afterEach: (hook: AfterNavigationHook) => () => void;
  onError: (handler: (error: unknown) => void) => () => void;
  addRoute: (
    parentOrRoute: string | symbol | NuxtRouteRecord,
    route?: NuxtRouteRecord,
  ) => () => void;
  removeRoute: (name: string | symbol) => void;
  hasRoute: (name: string | symbol) => boolean;
  getRoutes: () => NuxtRouteRecord[];
}

function parseQueryRecord(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  });
  return query;
}

function serializeQueryRecord(query?: Record<string, any>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(query)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== undefined && item !== null) {
          params.append(key, String(item));
        }
      }
    } else {
      params.append(key, String(val));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

function matchRegisteredRoute(
  store: NuxtScopeStore,
  path: string,
  name?: string | symbol | null,
): {
  record?: NuxtRouteRecord;
  params: Record<string, string | string[]>;
} {
  if (name !== undefined && name !== null && store.routes.has(name)) {
    const rec = store.routes.get(name)!;
    return { record: rec, params: {} };
  }
  for (const rec of store.routes.values()) {
    if (rec.path === path) {
      return { record: rec, params: {} };
    }
    const patternParts = rec.path.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < patternParts.length; i++) {
      const pat = patternParts[i]!;
      const seg = pathParts[i]!;
      if (pat.startsWith(":")) {
        params[pat.slice(1)] = decodeURIComponent(seg);
      } else if (pat !== seg) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { record: rec, params };
    }
  }
  return { params: {} };
}

function buildRouteLocation(
  store: NuxtScopeStore,
  raw: NuxtRouteLocationRaw,
): NuxtRouteLocation {
  if (typeof raw === "string") {
    const parsed = new URL(raw, "http://localhost");
    const path = parsed.pathname || "/";
    const query = parseQueryRecord(parsed.searchParams);
    const hash = parsed.hash || "";
    const fullPath = `${path}${parsed.search}${hash}`;
    const { record, params } = matchRegisteredRoute(store, path);
    const ctxParams = store.event?.context?.params;
    const ctxMeta = store.event?.context?.routeMeta;
    return {
      path,
      fullPath,
      query,
      hash,
      params: { ...params, ...ctxParams },
      name: record?.name ?? null,
      meta: { ...record?.meta, ...ctxMeta },
      matched: record ? [record] : [],
    };
  }

  let basePath = raw.path;
  let matchedRecord: NuxtRouteRecord | undefined;
  if (!basePath && raw.name !== undefined && store.routes.has(raw.name)) {
    matchedRecord = store.routes.get(raw.name)!;
    basePath = matchedRecord.path;
    if (raw.params) {
      for (const [k, v] of Object.entries(raw.params)) {
        basePath = basePath.replace(`:${k}`, encodeURIComponent(String(v)));
      }
    }
  }
  const parsed = new URL(basePath ?? "/", "http://localhost");
  const path = parsed.pathname || "/";
  const mergedQuery: Record<string, string | string[]> = {
    ...parseQueryRecord(parsed.searchParams),
  };
  if (raw.query) {
    for (const [k, v] of Object.entries(raw.query)) {
      if (v === undefined || v === null) {
        delete mergedQuery[k];
      } else if (Array.isArray(v)) {
        mergedQuery[k] = v.map(String);
      } else {
        mergedQuery[k] = String(v);
      }
    }
  }
  const search = serializeQueryRecord(mergedQuery);
  const rawHash = raw.hash ?? parsed.hash ?? "";
  const hash =
    rawHash && !rawHash.startsWith("#") ? `#${rawHash}` : rawHash || "";
  const fullPath = `${path}${search}${hash}`;
  const match = matchedRecord
    ? { record: matchedRecord, params: {} }
    : matchRegisteredRoute(store, path, raw.name);
  const normalizedParams: Record<string, string | string[]> = {
    ...match.params,
  };
  if (raw.params) {
    for (const [k, v] of Object.entries(raw.params)) {
      normalizedParams[k] = Array.isArray(v) ? v.map(String) : String(v);
    }
  }
  return {
    path,
    fullPath,
    query: mergedQuery,
    hash,
    params: normalizedParams,
    name: raw.name ?? match.record?.name ?? null,
    meta: { ...match.record?.meta, ...raw.meta },
    matched: match.record ? [match.record] : [],
  };
}

function ensureRouteSignal(store: NuxtScopeStore): MsSignal<NuxtRouteLocation> {
  if (!store.routeSignal) {
    const initialRaw = store.event
      ? `${store.event.url.pathname}${store.event.url.search}${store.event.url.hash}`
      : typeof window !== "undefined" && window.location
        ? `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
        : "/";
    store.routeSignal = msCreateSignal<NuxtRouteLocation>(
      buildRouteLocation(store, initialRaw),
    );
  }
  return store.routeSignal;
}

export function useRoute(): NuxtRouteLocation {
  const store = resolveScopeStore();
  const sig = ensureRouteSignal(store);
  if (!store.routeProxy) {
    store.routeProxy = new Proxy({} as NuxtRouteLocation, {
      get(_target, prop) {
        const current = sig();
        return Reflect.get(current, prop);
      },
      set(_target, prop, value) {
        const current = untrack(sig);
        sig.set(() => ({
          ...current,
          [prop]: value,
        }));
        return true;
      },
      has(_target, prop) {
        const current = sig();
        return prop in current;
      },
      ownKeys() {
        const current = sig();
        return Reflect.ownKeys(current);
      },
      getOwnPropertyDescriptor(_target, prop) {
        const current = sig();
        const desc = Reflect.getOwnPropertyDescriptor(current, prop);
        if (desc) return { ...desc, configurable: true };
        return undefined;
      },
    });
  }
  return store.routeProxy;
}

function isNavigationAbort(value: unknown): value is NavigationAbort {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __nuxt_abort?: unknown }).__nuxt_abort === true
  );
}

function createNavigationFailure(
  from: NuxtRouteLocation,
  to: NuxtRouteLocation,
  type: "aborted" | "cancelled" | "duplicated" = "aborted",
  message?: string,
): NavigationFailure {
  const err = new Error(
    message ?? `Navigation ${type} from "${from.fullPath}" to "${to.fullPath}"`,
  ) as NavigationFailure;
  Object.defineProperty(err, "__nuxt_nav_failure", {
    value: true,
    enumerable: false,
  });
  Object.defineProperty(err, "from", { value: from, enumerable: true });
  Object.defineProperty(err, "to", { value: to, enumerable: true });
  Object.defineProperty(err, "type", { value: type, enumerable: true });
  return err;
}

export function abortNavigation(
  err?: string | Partial<NuxtError> | Error,
): NavigationAbort {
  if (!err) {
    return { __nuxt_abort: true };
  }
  const nuxtErr = isNuxtError(err)
    ? err
    : err instanceof Error
      ? new NuxtError({
          message: err.message,
          stack: err.stack,
          cause: err.cause,
        })
      : createError(err);
  return {
    __nuxt_abort: true,
    error: nuxtErr,
  };
}

async function performRouterNavigation(
  store: NuxtScopeStore,
  rawTo: NuxtRouteLocationRaw,
  replace = false,
  redirectedFrom?: NuxtRouteLocation,
): Promise<NuxtRouteLocation | NavigationFailure | void> {
  const sig = ensureRouteSignal(store);
  const from = untrack(sig);
  const to = buildRouteLocation(store, rawTo);
  if (redirectedFrom) {
    to.redirectedFrom = redirectedFrom;
  }

  const routeMetaMiddlewareRaw = to.meta?.middleware;
  const routeMetaList = Array.isArray(routeMetaMiddlewareRaw)
    ? routeMetaMiddlewareRaw
    : routeMetaMiddlewareRaw !== undefined && routeMetaMiddlewareRaw !== null
      ? [routeMetaMiddlewareRaw]
      : [];
  const resolvedRouteMiddlewares: NavigationGuard[] = [];
  for (const item of routeMetaList) {
    if (typeof item === "function") {
      resolvedRouteMiddlewares.push(item as NavigationGuard);
    } else if (typeof item === "string") {
      const named = store.namedMiddlewares.get(item);
      if (named) {
        resolvedRouteMiddlewares.push(named);
      }
    }
  }

  const guards: NavigationGuard[] = [
    ...(from.path !== to.path ? Array.from(store.leaveGuards) : []),
    ...Array.from(store.beforeGuards),
    ...Array.from(store.globalMiddlewares),
    ...resolvedRouteMiddlewares,
    ...(from.path === to.path ? Array.from(store.updateGuards) : []),
  ];

  for (const guard of guards) {
    try {
      const result = await guard(to, from);
      if (result === false || isNavigationAbort(result)) {
        if (isNavigationAbort(result) && result.error) {
          for (const handler of store.errorHandlers) {
            handler(result.error);
          }
          throw result.error;
        }
        const failure = createNavigationFailure(from, to, "aborted");
        for (const hook of store.afterHooks) {
          await hook(to, from, failure);
        }
        return failure;
      }
      if (result instanceof Error) {
        for (const handler of store.errorHandlers) {
          handler(result);
        }
        throw result;
      }
      if (
        typeof result === "string" ||
        (typeof result === "object" && result !== null)
      ) {
        return performRouterNavigation(
          store,
          result as NuxtRouteLocationRaw,
          replace,
          redirectedFrom ?? to,
        );
      }
    } catch (err) {
      for (const handler of store.errorHandlers) {
        handler(err);
      }
      throw err;
    }
  }

  sig.set(() => to);
  if (store.event) {
    store.event.url = new URL(to.fullPath, store.event.url.origin);
  } else if (typeof window !== "undefined" && window.history) {
    if (replace && typeof window.history.replaceState === "function") {
      window.history.replaceState({}, "", to.fullPath);
    } else if (!replace && typeof window.history.pushState === "function") {
      window.history.pushState({}, "", to.fullPath);
    }
  }

  for (const hook of store.afterHooks) {
    await hook(to, from, undefined);
  }
  return to;
}

export function useRouter(): NuxtRouter {
  const store = resolveScopeStore();
  if (!store.router) {
    const sig = ensureRouteSignal(store);
    const currentRoute = fromMoonshineSignal(sig);
    store.router = {
      currentRoute,
      resolve(to: NuxtRouteLocationRaw): NuxtRouteLocation {
        return buildRouteLocation(store, to);
      },
      push(to: NuxtRouteLocationRaw) {
        const isReplace =
          typeof to === "object" && to !== null && Boolean(to.replace);
        return performRouterNavigation(store, to, isReplace);
      },
      replace(to: NuxtRouteLocationRaw) {
        return performRouterNavigation(store, to, true);
      },
      back() {
        if (
          typeof window !== "undefined" &&
          typeof window.history?.back === "function"
        ) {
          window.history.back();
        }
      },
      forward() {
        if (
          typeof window !== "undefined" &&
          typeof window.history?.forward === "function"
        ) {
          window.history.forward();
        }
      },
      go(delta: number) {
        if (
          typeof window !== "undefined" &&
          typeof window.history?.go === "function"
        ) {
          window.history.go(delta);
        }
      },
      beforeEach(guard: NavigationGuard) {
        store.beforeGuards.add(guard);
        return () => {
          store.beforeGuards.delete(guard);
        };
      },
      afterEach(hook: AfterNavigationHook) {
        store.afterHooks.add(hook);
        return () => {
          store.afterHooks.delete(hook);
        };
      },
      onError(handler: (error: unknown) => void) {
        store.errorHandlers.add(handler);
        return () => {
          store.errorHandlers.delete(handler);
        };
      },
      addRoute(
        parentOrRoute: string | symbol | NuxtRouteRecord,
        maybeRoute?: NuxtRouteRecord,
      ) {
        const record =
          typeof parentOrRoute === "object" ? parentOrRoute : maybeRoute!;
        const key = record.name ?? record.path;
        store.routes.set(key, record);
        return () => {
          store.routes.delete(key);
        };
      },
      removeRoute(name: string | symbol) {
        store.routes.delete(name);
      },
      hasRoute(name: string | symbol): boolean {
        return store.routes.has(name);
      },
      getRoutes(): NuxtRouteRecord[] {
        return Array.from(store.routes.values());
      },
    };
  }
  return store.router;
}

export function onBeforeRouteLeave(guard: NavigationGuard): void {
  const store = resolveScopeStore();
  store.leaveGuards.add(guard);
  const owner = getOwner();
  if (owner) {
    onCleanup(() => {
      store.leaveGuards.delete(guard);
    });
  }
}

export function onBeforeRouteUpdate(guard: NavigationGuard): void {
  const store = resolveScopeStore();
  store.updateGuards.add(guard);
  const owner = getOwner();
  if (owner) {
    onCleanup(() => {
      store.updateGuards.delete(guard);
    });
  }
}

export interface NavigateToOptions {
  replace?: boolean;
  redirectCode?: number;
  external?: boolean;
  open?: {
    target: string;
    windowFeatures?: Record<string, any>;
  };
}

export async function navigateTo(
  to: NuxtRouteLocationRaw | undefined | null,
  options: NavigateToOptions = {},
): Promise<NuxtRouteLocation | NavigationFailure | Response | void> {
  const store = resolveScopeStore();
  const normalizedTo: NuxtRouteLocationRaw = to || "/";
  const isExternalUrl =
    typeof normalizedTo === "string" &&
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(normalizedTo);

  if (isExternalUrl && !options.external && !options.open) {
    throw new Error(
      `Navigating to an external URL ("${normalizedTo}") is not allowed by default. Use navigateTo(url, { external: true }).`,
    );
  }

  const targetHref = isExternalUrl
    ? (normalizedTo as string)
    : buildRouteLocation(store, normalizedTo).fullPath;

  if (options.open && typeof window !== "undefined") {
    const features = options.open.windowFeatures
      ? Object.entries(options.open.windowFeatures)
          .filter(([, v]) => v !== undefined && v !== false)
          .map(([k, v]) => (v === true ? k : `${k}=${v}`))
          .join(",")
      : undefined;
    if (typeof window.open === "function") {
      window.open(targetHref, options.open.target, features);
    }
    return;
  }

  if (store.event) {
    const status = options.redirectCode ?? 302;
    store.event.responseStatus = status;
    store.event.responseHeaders.set("Location", targetHref);
    if (!isExternalUrl) {
      await performRouterNavigation(
        store,
        normalizedTo,
        Boolean(options.replace),
      );
    }
    return new Response(null, {
      status,
      headers: { Location: targetHref },
    });
  }

  if (isExternalUrl) {
    if (typeof window !== "undefined" && window.location) {
      if (options.replace && typeof window.location.replace === "function") {
        window.location.replace(targetHref);
      } else {
        window.location.href = targetHref;
      }
    }
    return;
  }

  const router = useRouter();
  return options.replace
    ? router.replace(normalizedTo)
    : router.push(normalizedTo);
}

export function setPageLayout(layout: string | false): void {
  const layoutState = useState<string | false>("_layout", () => "default");
  layoutState.value = layout;
  const route = useRoute();
  route.meta = { ...route.meta, layout };
}

export interface HeadInput {
  title?: MaybeReactive<string | null | undefined>;
  titleTemplate?: string | ((title?: string) => string | null) | null;
  base?: MaybeReactive<Record<string, any>>;
  link?: MaybeReactive<Array<Record<string, any>>>;
  meta?: MaybeReactive<Array<Record<string, any>>>;
  style?: MaybeReactive<Array<Record<string, any> | string>>;
  script?: MaybeReactive<Array<Record<string, any> | string>>;
  noscript?: MaybeReactive<Array<Record<string, any> | string>>;
  htmlAttrs?: MaybeReactive<Record<string, any>>;
  bodyAttrs?: MaybeReactive<Record<string, any>>;
}

export interface ResolvedHead {
  title: string;
  base?: Record<string, any>;
  link: Array<Record<string, any>>;
  meta: Array<Record<string, any>>;
  style: Array<Record<string, any> | string>;
  script: Array<Record<string, any> | string>;
  noscript: Array<Record<string, any> | string>;
  htmlAttrs: Record<string, any>;
  bodyAttrs: Record<string, any>;
}

export interface ActiveHeadEntry<T = HeadInput> {
  patch: (input: MaybeReactive<T>) => void;
  dispose: () => void;
}

function deepResolveHeadValue<T>(value: T): T {
  const unwrapped = resolveReactive(value as MaybeReactive<T>);
  if (Array.isArray(unwrapped)) {
    return unwrapped.map((item) => deepResolveHeadValue(item)) as unknown as T;
  }
  if (
    unwrapped !== null &&
    typeof unwrapped === "object" &&
    Object.getPrototypeOf(unwrapped) === Object.prototype
  ) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(unwrapped)) {
      out[k] = deepResolveHeadValue(v);
    }
    return out as T;
  }
  return unwrapped as T;
}

export function resolveHeadTags(): ResolvedHead {
  const store = resolveScopeStore();
  let rawTitle: string | undefined;
  let titleTemplate:
    string | ((title?: string) => string | null) | null | undefined;
  let base: Record<string, any> | undefined;
  const link: Array<Record<string, any>> = [];
  const metaMap = new Map<string, Record<string, any>>();
  const metaList: Array<Record<string, any>> = [];
  const style: Array<Record<string, any> | string> = [];
  const script: Array<Record<string, any> | string> = [];
  const noscript: Array<Record<string, any> | string> = [];
  const htmlAttrs: Record<string, any> = {};
  const bodyAttrs: Record<string, any> = {};

  for (const entry of store.headEntries) {
    const raw = entry.signal();
    const resolved = deepResolveHeadValue(raw) as HeadInput | undefined;
    if (!resolved) continue;

    if (resolved.title !== undefined && resolved.title !== null) {
      rawTitle = String(resolved.title);
    }
    if (resolved.titleTemplate !== undefined) {
      titleTemplate = resolved.titleTemplate;
    }
    if (resolved.base) {
      base = { ...base, ...resolved.base };
    }
    if (Array.isArray(resolved.link)) {
      for (const item of resolved.link) {
        link.push({ ...item });
      }
    }
    if (Array.isArray(resolved.meta)) {
      for (const item of resolved.meta) {
        const dedupeKey =
          item.key ??
          (item.name ? `name:${item.name}` : undefined) ??
          (item.property ? `property:${item.property}` : undefined) ??
          (item.httpEquiv ? `http-equiv:${item.httpEquiv}` : undefined) ??
          (item.charset ? "charset" : undefined);
        if (dedupeKey) {
          metaMap.set(String(dedupeKey), { ...item });
        } else {
          metaList.push({ ...item });
        }
      }
    }
    if (Array.isArray(resolved.style)) {
      for (const item of resolved.style) {
        style.push(typeof item === "string" ? item : { ...item });
      }
    }
    if (Array.isArray(resolved.script)) {
      for (const item of resolved.script) {
        script.push(typeof item === "string" ? item : { ...item });
      }
    }
    if (Array.isArray(resolved.noscript)) {
      for (const item of resolved.noscript) {
        noscript.push(typeof item === "string" ? item : { ...item });
      }
    }
    if (resolved.htmlAttrs) {
      Object.assign(htmlAttrs, resolved.htmlAttrs);
    }
    if (resolved.bodyAttrs) {
      Object.assign(bodyAttrs, resolved.bodyAttrs);
    }
  }

  let finalTitle = rawTitle ?? "";
  if (titleTemplate) {
    if (typeof titleTemplate === "function") {
      finalTitle = titleTemplate(rawTitle) ?? "";
    } else if (typeof titleTemplate === "string") {
      finalTitle = rawTitle
        ? titleTemplate.replace(/%s/g, rawTitle)
        : titleTemplate.replace(/\s*[-|]\s*%s|%s/g, "").trim();
    }
  }

  return {
    title: finalTitle,
    ...(base ? { base } : {}),
    link,
    meta: [...Array.from(metaMap.values()), ...metaList],
    style,
    script,
    noscript,
    htmlAttrs,
    bodyAttrs,
  };
}

export function useHead(
  input: MaybeReactive<HeadInput>,
): ActiveHeadEntry<HeadInput> {
  const store = resolveScopeStore();
  const id = store.nextHeadId++;
  const signal = msCreateSignal<MaybeReactive<HeadInput>>(input);
  const record: HeadEntryRecord = { id, signal };
  store.headEntries.push(record);

  const dispose = () => {
    const idx = store.headEntries.indexOf(record);
    if (idx !== -1) {
      store.headEntries.splice(idx, 1);
    }
  };

  const owner = getOwner();
  if (owner) {
    onCleanup(dispose);
  }

  return {
    patch(nextInput: MaybeReactive<HeadInput>) {
      signal.set(() => nextInput);
    },
    dispose,
  };
}

function isUnsafeUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("data:text/html")
  );
}

function sanitizeAttrs(
  attrs: Record<string, any> | undefined,
  allowedKeys?: Set<string>,
): Record<string, any> {
  if (!attrs || typeof attrs !== "object") return {};
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(attrs)) {
    const lower = key.toLowerCase();
    if (lower.startsWith("on")) continue;
    if (allowedKeys && !allowedKeys.has(key) && !key.startsWith("data-")) {
      continue;
    }
    if (
      (lower === "href" ||
        lower === "src" ||
        lower === "content" ||
        lower === "action") &&
      isUnsafeUrl(val)
    ) {
      continue;
    }
    clean[key] = val;
  }
  return clean;
}

const SAFE_LINK_KEYS = new Set([
  "id",
  "rel",
  "href",
  "hreflang",
  "type",
  "media",
  "sizes",
  "imagesrcset",
  "imagesizes",
  "as",
  "crossorigin",
  "integrity",
  "referrerpolicy",
  "title",
  "color",
  "key",
]);

const SAFE_META_KEYS = new Set([
  "id",
  "name",
  "property",
  "content",
  "charset",
  "media",
  "key",
]);

const SAFE_A11Y_ATTR_KEYS = new Set([
  "id",
  "class",
  "dir",
  "lang",
  "translate",
  "tabindex",
  "role",
]);

function sanitizeHeadInput(raw: HeadInput): HeadInput {
  const resolved = deepResolveHeadValue(raw);
  const safeLink = Array.isArray(resolved.link)
    ? resolved.link
        .filter((rawItem) => !("href" in rawItem && isUnsafeUrl(rawItem.href)))
        .map((item) => sanitizeAttrs(item, SAFE_LINK_KEYS))
        .filter((item) => {
          const rel = String(item.rel ?? "").toLowerCase();
          if (
            rel === "stylesheet" ||
            rel === "preload" ||
            rel === "modulepreload"
          ) {
            return false;
          }
          return Boolean(item.href || item.imagesrcset);
        })
    : undefined;

  const safeMeta = Array.isArray(resolved.meta)
    ? resolved.meta
        .filter((item) => !("http-equiv" in item) && !("httpEquiv" in item))
        .map((item) => sanitizeAttrs(item, SAFE_META_KEYS))
        .filter((item) => Object.keys(item).length > 0)
    : undefined;

  return {
    ...(resolved.title !== undefined ? { title: resolved.title } : {}),
    ...(safeLink ? { link: safeLink } : {}),
    ...(safeMeta ? { meta: safeMeta } : {}),
    ...(resolved.htmlAttrs
      ? { htmlAttrs: sanitizeAttrs(resolved.htmlAttrs, SAFE_A11Y_ATTR_KEYS) }
      : {}),
    ...(resolved.bodyAttrs
      ? { bodyAttrs: sanitizeAttrs(resolved.bodyAttrs, SAFE_A11Y_ATTR_KEYS) }
      : {}),
  };
}

export function useHeadSafe(
  input: MaybeReactive<HeadInput>,
): ActiveHeadEntry<HeadInput> {
  const entry = useHead(() => sanitizeHeadInput(resolveReactive(input) ?? {}));
  return {
    patch(nextInput: MaybeReactive<HeadInput>) {
      entry.patch(() => sanitizeHeadInput(resolveReactive(nextInput) ?? {}));
    },
    dispose: entry.dispose,
  };
}

export interface SeoMetaInput {
  title?: MaybeReactive<string | null | undefined>;
  titleTemplate?: string | ((title?: string) => string | null) | null;
  description?: MaybeReactive<string | null | undefined>;
  author?: MaybeReactive<string | null | undefined>;
  robots?: MaybeReactive<string | null | undefined>;
  keywords?: MaybeReactive<string | null | undefined>;
  applicationName?: MaybeReactive<string | null | undefined>;
  generator?: MaybeReactive<string | null | undefined>;
  referrer?: MaybeReactive<string | null | undefined>;
  colorScheme?: MaybeReactive<string | null | undefined>;
  themeColor?: MaybeReactive<string | null | undefined>;
  viewport?: MaybeReactive<string | null | undefined>;
  charset?: MaybeReactive<string | null | undefined>;
  ogTitle?: MaybeReactive<string | null | undefined>;
  ogDescription?: MaybeReactive<string | null | undefined>;
  ogImage?: MaybeReactive<string | null | undefined>;
  ogImageAlt?: MaybeReactive<string | null | undefined>;
  ogImageWidth?: MaybeReactive<string | number | null | undefined>;
  ogImageHeight?: MaybeReactive<string | number | null | undefined>;
  ogUrl?: MaybeReactive<string | null | undefined>;
  ogType?: MaybeReactive<string | null | undefined>;
  ogSiteName?: MaybeReactive<string | null | undefined>;
  ogLocale?: MaybeReactive<string | null | undefined>;
  twitterCard?: MaybeReactive<
    | "summary"
    | "summary_large_image"
    | "app"
    | "player"
    | (string & {})
    | null
    | undefined
  >;
  twitterTitle?: MaybeReactive<string | null | undefined>;
  twitterDescription?: MaybeReactive<string | null | undefined>;
  twitterImage?: MaybeReactive<string | null | undefined>;
  twitterImageAlt?: MaybeReactive<string | null | undefined>;
  twitterSite?: MaybeReactive<string | null | undefined>;
  twitterCreator?: MaybeReactive<string | null | undefined>;
  fbAppId?: MaybeReactive<string | number | null | undefined>;
  canonical?: MaybeReactive<string | null | undefined>;
  [key: string]: any;
}

const SEO_PROPERTY_MAP: Record<
  string,
  { attr: "name" | "property"; key: string }
> = {
  description: { attr: "name", key: "description" },
  author: { attr: "name", key: "author" },
  robots: { attr: "name", key: "robots" },
  keywords: { attr: "name", key: "keywords" },
  applicationName: { attr: "name", key: "application-name" },
  generator: { attr: "name", key: "generator" },
  referrer: { attr: "name", key: "referrer" },
  colorScheme: { attr: "name", key: "color-scheme" },
  themeColor: { attr: "name", key: "theme-color" },
  viewport: { attr: "name", key: "viewport" },
  ogTitle: { attr: "property", key: "og:title" },
  ogDescription: { attr: "property", key: "og:description" },
  ogImage: { attr: "property", key: "og:image" },
  ogImageAlt: { attr: "property", key: "og:image:alt" },
  ogImageWidth: { attr: "property", key: "og:image:width" },
  ogImageHeight: { attr: "property", key: "og:image:height" },
  ogUrl: { attr: "property", key: "og:url" },
  ogType: { attr: "property", key: "og:type" },
  ogSiteName: { attr: "property", key: "og:site_name" },
  ogLocale: { attr: "property", key: "og:locale" },
  twitterCard: { attr: "name", key: "twitter:card" },
  twitterTitle: { attr: "name", key: "twitter:title" },
  twitterDescription: { attr: "name", key: "twitter:description" },
  twitterImage: { attr: "name", key: "twitter:image" },
  twitterImageAlt: { attr: "name", key: "twitter:image:alt" },
  twitterSite: { attr: "name", key: "twitter:site" },
  twitterCreator: { attr: "name", key: "twitter:creator" },
  fbAppId: { attr: "property", key: "fb:app_id" },
};

function convertSeoMetaToHead(input: SeoMetaInput): HeadInput {
  const meta: Array<Record<string, any>> = [];
  const link: Array<Record<string, any>> = [];
  const head: HeadInput = {};

  if (input.title !== undefined) {
    head.title = resolveReactive(input.title);
  }
  if (input.titleTemplate !== undefined) {
    head.titleTemplate = input.titleTemplate;
  }
  const charsetVal = resolveReactive(input.charset);
  if (charsetVal !== undefined && charsetVal !== null) {
    meta.push({ charset: String(charsetVal) });
  }
  const canonicalVal = resolveReactive(input.canonical);
  if (canonicalVal !== undefined && canonicalVal !== null) {
    link.push({ rel: "canonical", href: String(canonicalVal) });
  }

  for (const [prop, mapping] of Object.entries(SEO_PROPERTY_MAP)) {
    if (!(prop in input)) continue;
    const val = resolveReactive(input[prop]);
    if (val === undefined || val === null) continue;
    meta.push({
      [mapping.attr]: mapping.key,
      content: String(val),
    });
  }

  if (meta.length > 0) head.meta = meta;
  if (link.length > 0) head.link = link;
  return head;
}

export function useSeoMeta(
  input: MaybeReactive<SeoMetaInput>,
): ActiveHeadEntry<SeoMetaInput> {
  const headEntry = useHead(() =>
    convertSeoMetaToHead(resolveReactive(input) ?? {}),
  );
  return {
    patch(nextInput: MaybeReactive<SeoMetaInput>) {
      headEntry.patch(() =>
        convertSeoMetaToHead(resolveReactive(nextInput) ?? {}),
      );
    },
    dispose: headEntry.dispose,
  };
}

export function useServerSeoMeta(
  input: MaybeReactive<SeoMetaInput>,
): ActiveHeadEntry<SeoMetaInput> {
  return useSeoMeta(input);
}

export async function preloadComponents(
  components: string | string[],
): Promise<void> {
  const store = resolveScopeStore();
  const list = Array.isArray(components) ? components : [components];
  for (const name of list) {
    store.preloadedComponents.add(name);
  }
}

export async function prefetchComponents(
  components: string | string[],
): Promise<void> {
  const store = resolveScopeStore();
  const list = Array.isArray(components) ? components : [components];
  for (const name of list) {
    store.prefetchedComponents.add(name);
  }
}

export async function preloadRouteComponents(to: string): Promise<void> {
  const store = resolveScopeStore();
  store.preloadedRoutes.add(to);
}

export type NuxtHookCallback = (...args: any[]) => any;

export interface NuxtHooks {
  hook: (name: string, fn: NuxtHookCallback) => () => void;
  hookOnce: (name: string, fn: NuxtHookCallback) => () => void;
  removeHook: (name: string, fn: NuxtHookCallback) => void;
  callHook: (name: string, ...args: any[]) => Promise<void>;
}

export interface NuxtPayload {
  data: Record<string, any>;
  state: Record<string, any>;
  _errors: Record<string, any>;
  serverRendered: boolean;
  prerenderedAt?: number;
  error?: NuxtError<any>;
}

export interface NuxtSSRContext {
  url: string;
  event?: NuxtRequestEvent;
  runtimeConfig: NuxtRuntimeConfig;
  payload: NuxtPayload;
}

export interface NuxtApp {
  payload: NuxtPayload;
  versions: {
    nuxt: string;
    moonshine: string;
  };
  hooks: NuxtHooks;
  hook: NuxtHooks["hook"];
  callHook: NuxtHooks["callHook"];
  provide: (name: string, value: unknown) => void;
  runWithContext: <T>(fn: () => T) => T;
  isHydrating: boolean;
  deferHydration: () => () => void;
  ssrContext?: NuxtSSRContext;
  [key: `$${string}`]: any;
}

function createHooksRegistry(): NuxtHooks {
  const map = new Map<string, Set<NuxtHookCallback>>();

  const removeHook = (name: string, fn: NuxtHookCallback) => {
    const set = map.get(name);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) {
      map.delete(name);
    }
  };

  const hook = (name: string, fn: NuxtHookCallback) => {
    let set = map.get(name);
    if (!set) {
      set = new Set();
      map.set(name, set);
    }
    set.add(fn);
    return () => removeHook(name, fn);
  };

  const hookOnce = (name: string, fn: NuxtHookCallback) => {
    const wrapper: NuxtHookCallback = (...args: any[]) => {
      removeHook(name, wrapper);
      return fn(...args);
    };
    return hook(name, wrapper);
  };

  const callHook = async (name: string, ...args: any[]): Promise<void> => {
    const set = map.get(name);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      await fn(...args);
    }
  };

  return {
    hook,
    hookOnce,
    removeHook,
    callHook,
  };
}

function createNuxtPayload(store: NuxtScopeStore): NuxtPayload {
  const extraData: Record<string, any> = {};
  const extraErrors: Record<string, any> = {};

  const dataProxy = new Proxy(extraData, {
    get(target, prop) {
      if (typeof prop === "string" && store.asyncData.has(prop)) {
        return store.asyncData.get(prop)!.data.value;
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      if (typeof prop === "string" && store.asyncData.has(prop)) {
        store.asyncData.get(prop)!.data.value = value;
        return true;
      }
      return Reflect.set(target, prop, value);
    },
    has(target, prop) {
      return (
        (typeof prop === "string" && store.asyncData.has(prop)) ||
        prop in target
      );
    },
    ownKeys(target) {
      return Array.from(
        new Set([...store.asyncData.keys(), ...Reflect.ownKeys(target)]),
      );
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && store.asyncData.has(prop)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: store.asyncData.get(prop)!.data.value,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });

  const stateProxy = new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      if (typeof prop === "string" && store.state.has(prop)) {
        return store.state.get(prop)!.value;
      }
      return undefined;
    },
    set(_target, prop, value) {
      if (typeof prop === "string") {
        const existing = store.state.get(prop);
        if (existing) {
          existing.value = value;
        } else {
          store.state.set(prop, createBridgedRef(value));
        }
        return true;
      }
      return false;
    },
    has(_target, prop) {
      return typeof prop === "string" && store.state.has(prop);
    },
    ownKeys() {
      return Array.from(store.state.keys());
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === "string" && store.state.has(prop)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: store.state.get(prop)!.value,
        };
      }
      return undefined;
    },
  });

  const errorsProxy = new Proxy(extraErrors, {
    get(target, prop) {
      if (typeof prop === "string" && store.asyncData.has(prop)) {
        return store.asyncData.get(prop)!.error.value;
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      if (typeof prop === "string" && store.asyncData.has(prop)) {
        store.asyncData.get(prop)!.error.value = value;
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });

  return {
    data: dataProxy,
    state: stateProxy,
    _errors: errorsProxy,
    serverRendered: Boolean(store.event || isSSRRendering()),
    get error() {
      return store.error?.value;
    },
    set error(next: NuxtError<any> | undefined) {
      if (!store.error) {
        store.error = createBridgedRef<NuxtError<any> | undefined>(next);
      } else {
        store.error.value = next;
      }
    },
  };
}

function ensureNuxtApp(store: NuxtScopeStore): NuxtApp {
  if (!store.nuxtApp) {
    const hooks = createHooksRegistry();
    const payload = createNuxtPayload(store);
    let pendingHydrationCount = 0;

    const app: NuxtApp = {
      payload,
      versions: {
        nuxt: "3.15.0",
        moonshine: "0.4.64",
      },
      hooks,
      hook: hooks.hook,
      callHook: hooks.callHook,
      isHydrating: false,
      deferHydration() {
        pendingHydrationCount++;
        app.isHydrating = true;
        let released = false;
        return () => {
          if (released) return;
          released = true;
          pendingHydrationCount = Math.max(0, pendingHydrationCount - 1);
          if (pendingHydrationCount === 0) {
            app.isHydrating = false;
          }
        };
      },
      provide(name: string, value: unknown) {
        const prefixed = (
          name.startsWith("$") ? name : `$${name}`
        ) as `$${string}`;
        if (prefixed in app) {
          throw new Error(
            `Cannot redefine property "${prefixed}" on NuxtApp instance.`,
          );
        }
        Object.defineProperty(app, prefixed, {
          value,
          enumerable: true,
          configurable: false,
          writable: false,
        });
      },
      runWithContext<T>(fn: () => T): T {
        const prev = activeRequestStore;
        activeRequestStore = store;
        try {
          const result = fn();
          if (
            result !== null &&
            typeof result === "object" &&
            typeof (result as { then?: unknown }).then === "function"
          ) {
            return Promise.resolve(result).finally(() => {
              if (activeRequestStore === store) {
                activeRequestStore = prev;
              }
            }) as T;
          }
          activeRequestStore = prev;
          return result;
        } catch (err) {
          activeRequestStore = prev;
          throw err;
        }
      },
      ...(store.event || isSSRRendering()
        ? {
            ssrContext: {
              url: store.event
                ? store.event.url.pathname + store.event.url.search
                : "/",
              event: store.event,
              runtimeConfig: store.runtimeConfig,
              payload,
            },
          }
        : {}),
    };
    store.nuxtApp = app;
  }
  return store.nuxtApp;
}

export function useNuxtApp(): NuxtApp {
  return ensureNuxtApp(resolveScopeStore());
}

export function tryUseNuxtApp(): NuxtApp | null {
  if (activeRequestStore || getOwner() || getSSRRenderScope()) {
    return ensureNuxtApp(resolveScopeStore());
  }
  return fallbackStore.nuxtApp ?? null;
}

export function defineNuxtComponent<T extends Record<string, any>>(
  options: T,
): T {
  return options;
}

export interface LoadingIndicatorOptions {
  duration?: number;
  throttle?: number;
  hideDelay?: number;
  resetDelay?: number;
  estimatedProgress?: (duration: number, elapsed: number) => number;
}

export interface LoadingIndicator {
  progress: VueRef<number>;
  isLoading: VueRef<boolean>;
  error: VueRef<boolean>;
  start: (opts?: { force?: boolean }) => void;
  set: (value: number, opts?: { force?: boolean }) => void;
  finish: (opts?: { force?: boolean; error?: boolean }) => void;
  clear: () => void;
}

export function useLoadingIndicator(
  _opts?: LoadingIndicatorOptions,
): LoadingIndicator {
  const store = resolveScopeStore();
  if (!store.loadingIndicator) {
    const progress = createBridgedRef(0);
    const isLoading = createBridgedRef(false);
    const error = createBridgedRef(false);

    const set = (value: number, opts?: { force?: boolean }) => {
      const clamped = Math.max(0, Math.min(100, value));
      if (opts?.force || isLoading.value || clamped > 0) {
        progress.value = clamped;
      }
    };

    const start = (opts?: { force?: boolean }) => {
      error.value = false;
      isLoading.value = true;
      set(0, opts);
    };

    const clear = () => {
      isLoading.value = false;
    };

    const finish = (opts?: { force?: boolean; error?: boolean }) => {
      progress.value = 100;
      if (opts?.error) {
        error.value = true;
      }
      isLoading.value = false;
      if (opts?.force) {
        progress.value = 0;
      }
    };

    const indicator: LoadingIndicator = {
      progress,
      isLoading,
      error,
      start,
      set,
      finish,
      clear,
    };
    store.loadingIndicator = indicator;

    const app = ensureNuxtApp(store);
    app.hook("page:loading:start", () => {
      indicator.start();
    });
    app.hook("page:loading:end", () => {
      indicator.finish();
    });
  }
  return store.loadingIndicator;
}

export type RouteAnnouncerPoliteness = "polite" | "assertive" | "off";

export interface RouteAnnouncer {
  message: VueRef<string>;
  politeness: VueRef<RouteAnnouncerPoliteness>;
  set: (message?: string, politeness?: RouteAnnouncerPoliteness) => void;
  polite: (message?: string) => void;
  assertive: (message?: string) => void;
  off: () => void;
}

export function useRouteAnnouncer(opts?: {
  politeness?: RouteAnnouncerPoliteness;
}): RouteAnnouncer {
  const store = resolveScopeStore();
  if (!store.routeAnnouncer) {
    const initialTitle = resolveHeadTags().title;
    const message = createBridgedRef(initialTitle);
    const politeness = createBridgedRef<RouteAnnouncerPoliteness>(
      opts?.politeness ?? "polite",
    );

    const set = (
      nextMessage = "",
      nextPoliteness: RouteAnnouncerPoliteness = "polite",
    ) => {
      message.value = nextMessage;
      politeness.value = nextPoliteness;
    };

    store.routeAnnouncer = {
      message,
      politeness,
      set,
      polite(nextMessage = "") {
        set(nextMessage, "polite");
      },
      assertive(nextMessage = "") {
        set(nextMessage, "assertive");
      },
      off() {
        politeness.value = "off";
      },
    };
  }
  return store.routeAnnouncer;
}

export function useRequestFetch(): (
  request: string | URL | Request,
  init?: RequestInit & {
    query?: Record<string, any>;
    params?: Record<string, any>;
    baseURL?: string;
  },
) => Promise<any> {
  const store = resolveScopeStore();
  const forwardedHeaders = useRequestHeaders(["cookie", "authorization"]);

  return async (request, init = {}) => {
    const baseURL = init.baseURL ?? store.runtimeConfig.app.baseURL ?? "/";
    let targetUrl: URL;
    if (request instanceof Request) {
      targetUrl = new URL(request.url);
    } else if (request instanceof URL) {
      targetUrl = new URL(request.href);
    } else {
      const origin = store.event?.url.origin ?? "http://localhost";
      const baseResolved = new URL(baseURL, origin);
      targetUrl = new URL(request, baseResolved);
    }

    const queryObj = init.query ?? init.params;
    if (queryObj) {
      for (const [k, v] of Object.entries(queryObj)) {
        if (v !== undefined && v !== null) {
          targetUrl.searchParams.set(k, String(v));
        }
      }
    }

    const headers = new Headers(
      request instanceof Request ? request.headers : undefined,
    );
    for (const [k, v] of Object.entries(forwardedHeaders)) {
      if (v !== undefined && !headers.has(k)) {
        headers.set(k, v);
      }
    }
    if (init.headers) {
      const extra = new Headers(init.headers);
      extra.forEach((val, key) => {
        headers.set(key, val);
      });
    }

    const res = await fetch(targetUrl.href, {
      ...init,
      headers,
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return res.json();
    }
    return res.text();
  };
}

export function onNuxtReady(callback: () => any): void {
  const store = resolveScopeStore();
  if (store.event || isSSRRendering()) {
    return;
  }
  const app = ensureNuxtApp(store);
  queueMicrotask(() => {
    void app.runWithContext(callback);
  });
}

let nextPrehydrateId = 1;

export function onPrehydrate(
  callback: ((el?: HTMLElement) => void) | string,
  key?: string,
): string | undefined {
  const store = resolveScopeStore();
  const code =
    typeof callback === "function" ? `(${callback.toString()})()` : callback;
  const id = key ?? `nph-${nextPrehydrateId++}`;
  store.prehydrateCallbacks.set(id, code);
  return key || typeof callback === "function" ? id : undefined;
}

export interface ReloadNuxtAppOptions {
  path?: string;
  ttl?: number;
  force?: boolean;
  persistState?: boolean;
}

export function reloadNuxtApp(options: ReloadNuxtAppOptions = {}): void {
  const store = resolveScopeStore();
  store.reloadHistory.push(options);
  if (store.event || isSSRRendering()) {
    return;
  }
  if (typeof window !== "undefined" && window.location) {
    if (options.path) {
      window.location.href = options.path;
    } else if (typeof window.location.reload === "function") {
      window.location.reload();
    }
  }
}

export function definePayloadReducer(
  name: string,
  reduce: (data: any) => any,
): void {
  const store = resolveScopeStore();
  store.payloadReducers.set(name, reduce);
}

export function definePayloadReviver(
  name: string,
  revive: (data: any) => any | undefined,
): void {
  const store = resolveScopeStore();
  store.payloadRevivers.set(name, revive);
}

function reducePayloadValue(value: any, store: NuxtScopeStore): any {
  for (const [name, reducer] of store.payloadReducers.entries()) {
    const reduced = reducer(value);
    if (reduced !== undefined && reduced !== false) {
      return {
        __nuxt_type: name,
        value: reducePayloadValue(reduced, store),
      };
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => reducePayloadValue(item, store));
  }
  if (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = reducePayloadValue(v, store);
    }
    return out;
  }
  return value;
}

function revivePayloadValue(value: any, store: NuxtScopeStore): any {
  if (Array.isArray(value)) {
    return value.map((item) => revivePayloadValue(item, store));
  }
  if (value !== null && typeof value === "object") {
    if (
      typeof (value as { __nuxt_type?: unknown }).__nuxt_type === "string" &&
      "value" in value
    ) {
      const typeName = (value as { __nuxt_type: string }).__nuxt_type;
      const inner = revivePayloadValue((value as { value: any }).value, store);
      const reviver = store.payloadRevivers.get(typeName);
      return reviver ? reviver(inner) : inner;
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = revivePayloadValue(v, store);
    }
    return out;
  }
  return value;
}

export function serializeNuxtPayload(
  payload?: NuxtPayload | Record<string, any>,
): string {
  const store = resolveScopeStore();
  const target = payload ?? ensureNuxtApp(store).payload;
  const plain: Record<string, any> = {};
  for (const key of Reflect.ownKeys(target)) {
    if (typeof key !== "string") continue;
    const rawVal = (target as Record<string, any>)[key];
    if (
      rawVal !== null &&
      typeof rawVal === "object" &&
      !Array.isArray(rawVal)
    ) {
      const snapshot: Record<string, any> = {};
      for (const subKey of Reflect.ownKeys(rawVal)) {
        if (typeof subKey === "string") {
          snapshot[subKey] = rawVal[subKey];
        }
      }
      plain[key] = reducePayloadValue(snapshot, store);
    } else {
      plain[key] = reducePayloadValue(rawVal, store);
    }
  }
  return JSON.stringify(plain);
}

export function reviveNuxtPayload<T = NuxtPayload>(
  serialized: string | Record<string, any>,
): T {
  const store = resolveScopeStore();
  const parsed =
    typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  const revived = revivePayloadValue(parsed, store);
  if (revived && typeof revived === "object") {
    const app = ensureNuxtApp(store);
    if (revived.state && typeof revived.state === "object") {
      for (const [k, v] of Object.entries(revived.state)) {
        app.payload.state[k] = v;
      }
    }
    if (revived.data && typeof revived.data === "object") {
      for (const [k, v] of Object.entries(revived.data)) {
        app.payload.data[k] = v;
      }
    }
  }
  return revived as T;
}

export interface UsePreviewModeOptions<
  T extends Record<string, any> = Record<string, any>,
> {
  shouldEnable?: () => boolean;
  getState?: (currentState: T) => T;
  onEnable?: () => void;
  onDisable?: () => void;
}

export function usePreviewMode<
  T extends Record<string, any> = Record<string, any>,
>(
  options: UsePreviewModeOptions<T> = {},
): {
  enabled: VueRef<boolean>;
  state: T;
} {
  const route = useRoute();
  const rawEnabled = useState<boolean>("_preview_enabled", () => {
    if (options.shouldEnable) {
      return Boolean(options.shouldEnable());
    }
    const q = route.query.preview;
    return q === "true" || q === "1";
  });
  const stateRef = useState<T>("_preview_state", () => {
    const initial = {} as T;
    if (rawEnabled.value && options.getState) {
      return options.getState(initial);
    }
    return initial;
  });

  if (rawEnabled.value && options.onEnable) {
    options.onEnable();
  }

  const enabled: VueRef<boolean> = {
    get value() {
      return rawEnabled.value;
    },
    set value(next: boolean) {
      const prev = rawEnabled.value;
      rawEnabled.value = next;
      if (!prev && next) {
        if (options.getState) {
          stateRef.value = options.getState(stateRef.value);
        }
        options.onEnable?.();
      } else if (prev && !next) {
        options.onDisable?.();
      }
    },
  };

  return {
    enabled,
    state: stateRef.value,
  };
}

export function useResponseHeader(
  name: string,
): VueRef<string | number | string[] | undefined> {
  const store = resolveScopeStore();
  const initial = store.event?.responseHeaders.get(name) ?? undefined;
  const sig = msCreateSignal<string | number | string[] | undefined>(initial);

  const syncHeader = (next: string | number | string[] | undefined) => {
    const ev = store.event;
    if (!ev) return;
    if (next === undefined || next === null || (next as unknown) === false) {
      ev.responseHeaders.delete(name);
      return;
    }
    if (Array.isArray(next)) {
      ev.responseHeaders.delete(name);
      for (const item of next) {
        ev.responseHeaders.append(name, String(item));
      }
      return;
    }
    ev.responseHeaders.set(name, String(next));
  };

  const ref: VueRef<string | number | string[] | undefined> = {
    get value() {
      return sig();
    },
    set value(next: string | number | string[] | undefined) {
      sig.set(() => next);
      syncHeader(next);
    },
  };
  refSignals.set(ref, sig);
  return ref;
}

export function useHydration<K extends string = string, T = any>(
  key: K,
  get: () => T,
  set: (value: T) => void,
): void {
  const store = resolveScopeStore();
  const app = ensureNuxtApp(store);
  if (store.event || isSSRRendering()) {
    const syncToPayload = () => {
      (app.payload as Record<string, any>)[key] = get();
    };
    syncToPayload();
    app.hooks.hook("app:rendered", syncToPayload);
    return;
  }
  if (key in app.payload) {
    set((app.payload as Record<string, any>)[key] as T);
  } else if (key in app.payload.data) {
    set(app.payload.data[key] as T);
  }
}
