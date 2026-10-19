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
  context: Record<string, any>;
}

export interface NuxtRequestInit {
  request?: Request;
  url?: URL | string;
  headers?: HeadersInit;
  responseHeaders?: HeadersInit;
  context?: Record<string, any>;
  runtimeConfig?: Partial<NuxtRuntimeConfig>;
  appConfig?: Record<string, any>;
}

type CookieEntry = {
  ref: VueRef<any>;
  decode: (raw: string) => any;
  defaultFactory?: () => any;
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

function isNuxtRequestEvent(value: unknown): value is NuxtRequestEvent {
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

function parseRawCookies(cookieString: string): Map<string, string> {
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

function formatSetCookieHeader<T>(
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
  if (
    options?.redirect &&
    typeof window !== "undefined" &&
    typeof window.history?.pushState === "function"
  ) {
    window.history.pushState({}, "", options.redirect);
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
