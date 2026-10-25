/**
 * Host-free Vue Router 4 runtime on the Moonshine reactive graph.
 * Provides `createRouter`, `createMemoryHistory`, `createWebHistory`,
 * `createWebHashHistory`, `useRouter`, `useRoute`, `useLink`,
 * `onBeforeRouteLeave`, `onBeforeRouteUpdate`, `RouterLink`, `RouterView`,
 * navigation guards, dynamic route matching, and `NavigationFailure` helpers.
 */
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { h as hDOM } from "@tschk/moonshine-dom/dom";
import { getOwner, onCleanup, untrack } from "@tschk/moonshine-dom/reactive";
import { h as hSSR } from "@tschk/moonshine-dom/ssr";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  hasInjectionContext,
  inject,
  provide,
  type InjectionKey,
} from "./context";
import {
  computed,
  ref,
  toRaw,
  unref,
  type MaybeRef,
  type Ref,
} from "./reactive";
import { getDefaultSlotFactory } from "./slots";

export type RouteParamValue = string;
export type RouteParams = Record<string, RouteParamValue | RouteParamValue[]>;
export type LocationQueryValue = string | null;
export type LocationQuery = Record<
  string,
  LocationQueryValue | LocationQueryValue[]
>;
export type LocationQueryValueRaw = LocationQueryValue | number | undefined;
export type LocationQueryRaw = Record<
  string | number,
  LocationQueryValueRaw | LocationQueryValueRaw[]
>;
export type RouteMeta = Record<string | number | symbol, unknown>;
export type RouteRecordName = string | symbol;

export interface RouteLocationOptions {
  replace?: boolean;
  force?: boolean;
  state?: HistoryState;
}

export type HistoryState = Record<string, any>;

export interface RouteLocationPathRaw extends RouteLocationOptions {
  path: string;
  query?: LocationQueryRaw;
  hash?: string;
}

export interface RouteLocationNamedRaw extends RouteLocationOptions {
  name: RouteRecordName;
  params?: Record<string, any>;
  query?: LocationQueryRaw;
  hash?: string;
}

export type RouteLocationRaw =
  string | RouteLocationPathRaw | RouteLocationNamedRaw;

export type RouteComponent = (...args: any[]) => any;

export interface RouteRecordRaw {
  path: string;
  name?: RouteRecordName;
  component?: RouteComponent;
  components?: Record<string, RouteComponent>;
  redirect?:
    RouteLocationRaw | ((to: RouteLocationNormalized) => RouteLocationRaw);
  alias?: string | string[];
  children?: RouteRecordRaw[];
  meta?: RouteMeta;
  props?:
    | boolean
    | Record<string, any>
    | ((to: RouteLocationNormalizedLoaded) => Record<string, any>);
  beforeEnter?: NavigationGuard | NavigationGuard[];
}

export interface RouteRecordNormalized {
  path: string;
  name: RouteRecordName | undefined;
  components: Record<string, RouteComponent>;
  redirect?:
    RouteLocationRaw | ((to: RouteLocationNormalized) => RouteLocationRaw);
  aliasOf: RouteRecordNormalized | undefined;
  children: RouteRecordRaw[];
  meta: RouteMeta;
  props: Record<
    string,
    | boolean
    | Record<string, any>
    | ((to: RouteLocationNormalizedLoaded) => Record<string, any>)
  >;
  beforeGuards: NavigationGuard[];
  leaveGuards: Set<NavigationGuard>;
  updateGuards: Set<NavigationGuard>;
}

export interface RouteLocationNormalized {
  path: string;
  fullPath: string;
  name: RouteRecordName | null | undefined;
  params: RouteParams;
  query: LocationQuery;
  hash: string;
  matched: RouteRecordNormalized[];
  meta: RouteMeta;
  redirectedFrom: RouteLocationNormalized | undefined;
}

export type RouteLocationNormalizedLoaded = RouteLocationNormalized;

export type NavigationGuardReturn =
  void | Error | boolean | RouteLocationRaw | ((vm: any) => any);

export type NavigationGuardNext = (
  valid?: boolean | RouteLocationRaw | Error | ((vm: any) => any),
) => void;

export type NavigationGuard = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalizedLoaded,
  next: NavigationGuardNext,
) => NavigationGuardReturn | Promise<NavigationGuardReturn>;

export type NavigationHookAfter = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalizedLoaded,
  failure?: NavigationFailure | void,
) => any;

export enum NavigationFailureType {
  aborted = 4,
  cancelled = 8,
  duplicated = 16,
}

export interface NavigationFailure extends Error {
  type: NavigationFailureType;
  from: RouteLocationNormalizedLoaded;
  to: RouteLocationNormalized;
}

const navigationFailureSymbol = /* @__PURE__ */ Symbol(
  "moonshine.vue.router.failure",
);

export function createRouterError(
  type: NavigationFailureType,
  from: RouteLocationNormalizedLoaded,
  to: RouteLocationNormalized,
): NavigationFailure {
  const descriptions: Record<NavigationFailureType, string> = {
    [NavigationFailureType.aborted]: `Navigation aborted from "${from.fullPath}" to "${to.fullPath}" via a navigation guard.`,
    [NavigationFailureType.cancelled]: `Navigation cancelled from "${from.fullPath}" to "${to.fullPath}" with a new navigation.`,
    [NavigationFailureType.duplicated]: `Avoided redundant navigation to current location: "${from.fullPath}".`,
  };
  const err = new Error(descriptions[type]) as NavigationFailure & {
    [navigationFailureSymbol]: boolean;
  };
  err.type = type;
  err.from = from;
  err.to = to;
  err[navigationFailureSymbol] = true;
  return err;
}

export function isNavigationFailure(
  error: unknown,
  type?: NavigationFailureType,
): error is NavigationFailure {
  if (
    typeof error !== "object" ||
    error === null ||
    !(navigationFailureSymbol in error)
  ) {
    return false;
  }
  if (type === undefined) return true;
  return Boolean((error as unknown as NavigationFailure).type & type);
}

export enum NavigationDirection {
  back = "back",
  forward = "forward",
  unknown = "",
}

export enum NavigationType {
  pop = "pop",
  push = "push",
}

export interface NavigationInformation {
  type: NavigationType;
  direction: NavigationDirection;
  delta: number;
}

export type NavigationCallback = (
  to: string,
  from: string,
  information: NavigationInformation,
) => void;

export interface RouterHistory {
  readonly base: string;
  readonly location: string;
  readonly state: HistoryState;
  push(to: string, data?: HistoryState): void;
  replace(to: string, data?: HistoryState): void;
  go(delta: number, triggerListeners?: boolean): void;
  listen(callback: NavigationCallback): () => void;
  createHref(location: string): string;
  destroy(): void;
}

function normalizeBase(base?: string): string {
  if (!base) return "";
  let cleaned = base.trim();
  if (!cleaned.startsWith("/") && !cleaned.startsWith("#")) {
    cleaned = "/" + cleaned;
  }
  return cleaned.replace(/\/+$/, "");
}

export function createMemoryHistory(base = ""): RouterHistory {
  const normalizedBase = normalizeBase(base);
  let queue: string[] = ["/"];
  let states: HistoryState[] = [{}];
  let position = 0;
  const listeners = new Set<NavigationCallback>();

  function setLocation(location: string, state: HistoryState = {}): void {
    queue.push(location);
    states.push(state);
    position++;
  }

  const routerHistory: RouterHistory = {
    base: normalizedBase,
    get location() {
      return queue[position] ?? "/";
    },
    get state() {
      return states[position] ?? {};
    },
    push(to, data = {}) {
      queue.splice(position + 1);
      states.splice(position + 1);
      setLocation(to, data);
    },
    replace(to, data = {}) {
      queue[position] = to;
      states[position] = data;
    },
    go(delta, shouldTrigger = true) {
      const from = this.location;
      const direction =
        delta < 0 ? NavigationDirection.back : NavigationDirection.forward;
      position = Math.max(0, Math.min(queue.length - 1, position + delta));
      if (shouldTrigger) {
        for (const cb of Array.from(listeners)) {
          cb(this.location, from, {
            direction,
            delta,
            type: NavigationType.pop,
          });
        }
      }
    },
    listen(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    createHref(location) {
      return (
        normalizedBase + (location.startsWith("/") ? location : "/" + location)
      );
    },
    destroy() {
      listeners.clear();
      queue = ["/"];
      states = [{}];
      position = 0;
    },
  };

  return routerHistory;
}

export function createWebHistory(base?: string): RouterHistory {
  const normalizedBase = normalizeBase(base);
  if (
    typeof window === "undefined" ||
    typeof window.history === "undefined" ||
    typeof window.location === "undefined"
  ) {
    return createMemoryHistory(normalizedBase);
  }
  const memory = createMemoryHistory(normalizedBase);
  const initialPath =
    (window.location.pathname.startsWith(normalizedBase)
      ? window.location.pathname.slice(normalizedBase.length) || "/"
      : window.location.pathname || "/") +
    (window.location.search || "") +
    (window.location.hash || "");
  memory.replace(initialPath, (window.history.state as HistoryState) ?? {});

  const onPopState = (ev: PopStateEvent) => {
    const prev = memory.location;
    const next =
      (window.location.pathname.startsWith(normalizedBase)
        ? window.location.pathname.slice(normalizedBase.length) || "/"
        : window.location.pathname || "/") +
      (window.location.search || "") +
      (window.location.hash || "");
    memory.replace(next, (ev.state as HistoryState) ?? {});
    for (const cb of Array.from(popListeners)) {
      cb(next, prev, {
        direction: NavigationDirection.unknown,
        delta: 0,
        type: NavigationType.pop,
      });
    }
  };

  const popListeners = new Set<NavigationCallback>();
  window.addEventListener("popstate", onPopState);

  return {
    base: normalizedBase,
    get location() {
      return memory.location;
    },
    get state() {
      return memory.state;
    },
    push(to, data = {}) {
      memory.push(to, data);
      try {
        window.history.pushState(data, "", this.createHref(to));
      } catch {
        // Ignore history pushState errors in synthetic DOM environments
      }
    },
    replace(to, data = {}) {
      memory.replace(to, data);
      try {
        window.history.replaceState(data, "", this.createHref(to));
      } catch {
        // Ignore history replaceState errors in synthetic DOM environments
      }
    },
    go(delta, triggerListeners = true) {
      memory.go(delta, triggerListeners);
      try {
        window.history.go(delta);
      } catch {
        // Ignore
      }
    },
    listen(callback) {
      popListeners.add(callback);
      const unsub = memory.listen(callback);
      return () => {
        popListeners.delete(callback);
        unsub();
      };
    },
    createHref(location) {
      return memory.createHref(location);
    },
    destroy() {
      window.removeEventListener("popstate", onPopState);
      popListeners.clear();
      memory.destroy();
    },
  };
}

export function createWebHashHistory(base?: string): RouterHistory {
  const prefix = base ? normalizeBase(base) + "/#" : "#";
  const history = createMemoryHistory(prefix);
  return {
    ...history,
    createHref(location) {
      const normalized = location.startsWith("/") ? location : "/" + location;
      return prefix + normalized;
    },
  };
}

export function parseQuery(search: string): LocationQuery {
  const query: LocationQuery = {};
  const cleaned = search.replace(/^\?/, "");
  if (!cleaned) return query;
  for (const part of cleaned.split("&")) {
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    const rawKey = eqIdx >= 0 ? part.slice(0, eqIdx) : part;
    const rawVal = eqIdx >= 0 ? part.slice(eqIdx + 1) : null;
    const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
    const val =
      rawVal === null ? null : decodeURIComponent(rawVal.replace(/\+/g, " "));
    if (key in query) {
      const existing = query[key];
      if (Array.isArray(existing)) {
        existing.push(val);
      } else {
        query[key] = [existing as LocationQueryValue, val];
      }
    } else {
      query[key] = val;
    }
  }
  return query;
}

export function stringifyQuery(query?: LocationQueryRaw): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined) continue;
    const encodedKey = encodeURIComponent(key);
    if (rawValue === null) {
      parts.push(encodedKey);
      continue;
    }
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const item of values) {
      if (item === undefined) continue;
      if (item === null) {
        parts.push(encodedKey);
      } else {
        parts.push(`${encodedKey}=${encodeURIComponent(String(item))}`);
      }
    }
  }
  return parts.join("&");
}

export const START_LOCATION: RouteLocationNormalizedLoaded =
  /* @__PURE__ */ Object.freeze({
    path: "/",
    name: undefined,
    params: Object.freeze({}),
    query: Object.freeze({}),
    hash: "",
    fullPath: "/",
    matched: [],
    meta: Object.freeze({}),
    redirectedFrom: undefined,
  });

export const routerKey: InjectionKey<Router> = /* @__PURE__ */ Symbol(
  "moonshine.vue.router",
) as InjectionKey<Router>;

export const routeLocationKey: InjectionKey<RouteLocationNormalizedLoaded> =
  /* @__PURE__ */ Symbol(
    "moonshine.vue.routeLocation",
  ) as InjectionKey<RouteLocationNormalizedLoaded>;

export const routerViewLocationKey: InjectionKey<
  Ref<RouteLocationNormalizedLoaded>
> = /* @__PURE__ */ Symbol("moonshine.vue.routerViewLocation") as InjectionKey<
  Ref<RouteLocationNormalizedLoaded>
>;

export const viewDepthKey: InjectionKey<number> = /* @__PURE__ */ Symbol(
  "moonshine.vue.routerViewDepth",
) as InjectionKey<number>;

export interface RouterOptions {
  history: RouterHistory;
  routes: ReadonlyArray<RouteRecordRaw>;
  parseQuery?: typeof parseQuery;
  stringifyQuery?: typeof stringifyQuery;
  linkActiveClass?: string;
  linkExactActiveClass?: string;
}

export interface Router {
  readonly currentRoute: Ref<RouteLocationNormalizedLoaded>;
  readonly options: RouterOptions;
  listening: boolean;
  addRoute(parentName: RouteRecordName, route: RouteRecordRaw): () => void;
  addRoute(route: RouteRecordRaw): () => void;
  removeRoute(name: RouteRecordName): void;
  hasRoute(name: RouteRecordName): boolean;
  getRoutes(): RouteRecordNormalized[];
  resolve(
    rawLocation: RouteLocationRaw,
    currentLocation?: RouteLocationNormalizedLoaded,
  ): RouteLocationNormalized & { href: string };
  push(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined>;
  replace(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined>;
  back(): ReturnType<Router["go"]>;
  forward(): ReturnType<Router["go"]>;
  go(delta: number): void;
  beforeEach(guard: NavigationGuard): () => void;
  beforeResolve(guard: NavigationGuard): () => void;
  afterEach(hook: NavigationHookAfter): () => void;
  onError(
    handler: (
      error: any,
      to: RouteLocationNormalized,
      from: RouteLocationNormalizedLoaded,
    ) => any,
  ): () => void;
  isReady(): Promise<void>;
  install(app?: any): void;
}

interface CompiledRouteEntry {
  record: RouteRecordNormalized;
  chain: RouteRecordNormalized[];
  regex: RegExp;
  paramKeys: Array<{ name: string; repeatable: boolean; optional: boolean }>;
  score: number;
}

function joinPaths(parentPath: string, childPath: string): string {
  if (!childPath) return parentPath || "/";
  if (childPath.startsWith("/")) return childPath;
  const base = parentPath.replace(/\/+$/, "");
  return `${base}/${childPath}`.replace(/\/+/g, "/");
}

function compileRoutePattern(path: string): {
  regex: RegExp;
  paramKeys: Array<{ name: string; repeatable: boolean; optional: boolean }>;
  score: number;
} {
  const normalized = path === "" ? "/" : path;
  if (normalized === "/") {
    return { regex: /^\/$/, paramKeys: [], score: 100 };
  }
  const segments = normalized.replace(/^\/+|\/+$/g, "").split("/");
  const paramKeys: Array<{
    name: string;
    repeatable: boolean;
    optional: boolean;
  }> = [];
  let pattern = "^";
  let score = 0;

  for (const seg of segments) {
    if (seg.startsWith(":")) {
      const match = /^:([A-Za-z0-9_]+)(?:\(([^)]+)\))?([?*+]?)$/.exec(seg);
      if (match) {
        const name = match[1]!;
        const customRegex = match[2];
        const modifier = match[3] || "";
        const repeatable = modifier === "+" || modifier === "*";
        const optional = modifier === "?" || modifier === "*";
        paramKeys.push({ name, repeatable, optional });
        if (customRegex && modifier === "*") {
          pattern += `(?:/(.*))?`;
          score += 1;
        } else if (repeatable && optional) {
          pattern += `(?:/(.+))?`;
          score += 2;
        } else if (repeatable) {
          pattern += `/(.+)`;
          score += 5;
        } else if (optional) {
          pattern += `(?:/(${customRegex ?? "[^/]+"}))?`;
          score += 8;
        } else {
          pattern += `/(${customRegex ?? "[^/]+"})`;
          score += 10;
        }
        continue;
      }
    }
    if (seg === "*") {
      paramKeys.push({ name: "pathMatch", repeatable: true, optional: true });
      pattern += `(?:/(.*))?`;
      score += 1;
      continue;
    }
    const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern += `/${escaped}`;
    score += 20;
  }

  pattern += "/?$";
  return { regex: new RegExp(pattern), paramKeys, score };
}

function normalizePropsOption(
  raw: RouteRecordRaw,
): RouteRecordNormalized["props"] {
  if (!raw.props) return {};
  if (typeof raw.props === "object" && !raw.component && raw.components) {
    return raw.props as RouteRecordNormalized["props"];
  }
  return { default: raw.props };
}

let activeRouter: Router | undefined;

export function setActiveRouter(router: Router | undefined): void {
  activeRouter = router;
}

export function createRouter(options: RouterOptions): Router {
  const routerHistory = options.history ?? createMemoryHistory();
  const parseQueryFn = options.parseQuery ?? parseQuery;
  const stringifyQueryFn = options.stringifyQuery ?? stringifyQuery;

  const entries: CompiledRouteEntry[] = [];
  const namedMap = new Map<RouteRecordName, CompiledRouteEntry>();
  const beforeGuards = new Set<NavigationGuard>();
  const beforeResolveGuards = new Set<NavigationGuard>();
  const afterHooks = new Set<NavigationHookAfter>();
  const errorHandlers = new Set<
    (
      error: any,
      to: RouteLocationNormalized,
      from: RouteLocationNormalizedLoaded,
    ) => any
  >();

  let currentNavigationId = 0;
  let ready = false;
  let readyWaiters: Array<{
    resolve: () => void;
    reject: (err: any) => void;
  }> = [];

  function markReady(err?: any) {
    if (ready) return;
    ready = true;
    const waiters = readyWaiters.splice(0);
    for (const w of waiters) {
      if (err) w.reject(err);
      else w.resolve();
    }
  }

  function insertRouteRecord(
    raw: RouteRecordRaw,
    parent?: CompiledRouteEntry,
    aliasOf?: RouteRecordNormalized,
  ): () => void {
    const fullPath = parent
      ? joinPaths(parent.record.path, raw.path)
      : raw.path || "/";
    const components: Record<string, RouteComponent> = raw.components
      ? { ...raw.components }
      : raw.component
        ? { default: raw.component }
        : {};
    const beforeEnterList = raw.beforeEnter
      ? Array.isArray(raw.beforeEnter)
        ? [...raw.beforeEnter]
        : [raw.beforeEnter]
      : [];

    const normalized: RouteRecordNormalized = {
      path: fullPath,
      name: raw.name,
      components,
      redirect: raw.redirect,
      aliasOf,
      children: raw.children ?? [],
      meta: { ...raw.meta },
      props: normalizePropsOption(raw),
      beforeGuards: beforeEnterList,
      leaveGuards: new Set(),
      updateGuards: new Set(),
    };

    const chain = parent ? [...parent.chain, normalized] : [normalized];
    const { regex, paramKeys, score } = compileRoutePattern(fullPath);
    const entry: CompiledRouteEntry = {
      record: normalized,
      chain,
      regex,
      paramKeys,
      score,
    };

    entries.push(entry);
    entries.sort((a, b) => b.score - a.score);
    if (normalized.name !== undefined && !aliasOf) {
      namedMap.set(normalized.name, entry);
    }

    const childRemovers: Array<() => void> = [];
    if (raw.children) {
      for (const child of raw.children) {
        childRemovers.push(insertRouteRecord(child, entry));
      }
    }

    if (raw.alias && !aliasOf) {
      const aliases = Array.isArray(raw.alias) ? raw.alias : [raw.alias];
      for (const aliasPath of aliases) {
        childRemovers.push(
          insertRouteRecord(
            { ...raw, path: aliasPath, alias: undefined },
            parent,
            normalized,
          ),
        );
      }
    }

    return () => {
      for (const removeChild of childRemovers) removeChild();
      const idx = entries.indexOf(entry);
      if (idx >= 0) entries.splice(idx, 1);
      if (
        normalized.name !== undefined &&
        namedMap.get(normalized.name) === entry
      ) {
        namedMap.delete(normalized.name);
      }
    };
  }

  for (const route of options.routes) {
    insertRouteRecord(route);
  }

  const currentRoute = ref<RouteLocationNormalizedLoaded>(START_LOCATION);

  function buildPathFromEntry(
    entry: CompiledRouteEntry,
    params: Record<string, any> = {},
  ): { path: string; params: RouteParams } {
    const normalizedParams: RouteParams = {};
    const segments = entry.record.path.replace(/^\/+|\/+$/g, "").split("/");
    if (entry.record.path === "/" || segments[0] === "") {
      return { path: "/", params: normalizedParams };
    }
    const outSegments: string[] = [];
    for (const seg of segments) {
      if (seg.startsWith(":")) {
        const match = /^:([A-Za-z0-9_]+)(?:\(([^)]+)\))?([?*+]?)$/.exec(seg);
        if (match) {
          const name = match[1]!;
          const modifier = match[3] || "";
          const optional = modifier === "?" || modifier === "*";
          const val = params[name];
          if (val === undefined || val === null || val === "") {
            if (optional) continue;
            throw new Error(`Missing required param "${name}"`);
          }
          if (Array.isArray(val)) {
            const strArr = val.map((v) => String(v));
            normalizedParams[name] = strArr;
            outSegments.push(...strArr.map((v) => encodeURIComponent(v)));
          } else {
            const strVal = String(val);
            normalizedParams[name] = strVal;
            outSegments.push(encodeURIComponent(strVal));
          }
          continue;
        }
      }
      outSegments.push(seg);
    }
    return {
      path: "/" + outSegments.join("/"),
      params: normalizedParams,
    };
  }

  function resolveStringLocation(
    rawLocation: string,
    currentLocation: RouteLocationNormalizedLoaded,
    parseQueryFn: (query: string) => LocationQuery,
  ) {
    let raw = rawLocation;
    let hash = "";
    let query: LocationQuery = {};
    let path = "/";
    const hashIdx = raw.indexOf("#");
    if (hashIdx >= 0) {
      hash = raw.slice(hashIdx);
      raw = raw.slice(0, hashIdx);
    }
    const queryIdx = raw.indexOf("?");
    if (queryIdx >= 0) {
      query = parseQueryFn(raw.slice(queryIdx + 1));
      raw = raw.slice(0, queryIdx);
    }
    if (!raw) {
      path = currentLocation.path || "/";
    } else if (raw.startsWith("/")) {
      path = raw;
    } else {
      const baseDir = currentLocation.path.replace(/\/[^/]*$/, "");
      path = `${baseDir}/${raw}`.replace(/\/+/g, "/");
    }
    return { path, query, hash };
  }

  function resolveNamedLocation(
    rawLocation: RouteLocationNamedRaw,
    currentLocation: RouteLocationNormalizedLoaded,
    namedMap: Map<RouteRecordName, CompiledRouteEntry>,
    buildPathFromEntry: (
      entry: CompiledRouteEntry,
      params?: Record<string, any>,
    ) => { path: string; params: RouteParams },
    parseQueryFn: (query: string) => LocationQuery,
    stringifyQueryFn: (query: LocationQueryRaw) => string,
  ) {
    const entry = namedMap.get(rawLocation.name);
    if (!entry) {
      throw new Error(`No match for route named "${String(rawLocation.name)}"`);
    }
    const mergedParams = {
      ...currentLocation.params,
      ...rawLocation.params,
    };
    const built = buildPathFromEntry(entry, mergedParams);
    const path = built.path;
    const params = built.params;
    const matched = entry.chain.map((r) => r.aliasOf ?? r);
    const name = entry.record.name;
    const query = rawLocation.query
      ? parseQueryFn(stringifyQueryFn(rawLocation.query))
      : {};
    const hash = rawLocation.hash
      ? rawLocation.hash.startsWith("#")
        ? rawLocation.hash
        : "#" + rawLocation.hash
      : "";
    return { path, params, matched, name, query, hash };
  }

  function resolvePathLocation(
    rawLocation: RouteLocationPathRaw,
    parseQueryFn: (query: string) => LocationQuery,
    stringifyQueryFn: (query: LocationQueryRaw) => string,
  ) {
    let raw = rawLocation.path || "/";
    let hash = "";
    let query: LocationQuery = {};
    const hashIdx = raw.indexOf("#");
    if (hashIdx >= 0) {
      hash = raw.slice(hashIdx);
      raw = raw.slice(0, hashIdx);
    }
    const queryIdx = raw.indexOf("?");
    if (queryIdx >= 0) {
      query = parseQueryFn(raw.slice(queryIdx + 1));
      raw = raw.slice(0, queryIdx);
    }
    if (rawLocation.query) {
      query = {
        ...query,
        ...parseQueryFn(stringifyQueryFn(rawLocation.query)),
      };
    }
    if (rawLocation.hash) {
      hash = rawLocation.hash.startsWith("#")
        ? rawLocation.hash
        : "#" + rawLocation.hash;
    }
    const path = raw.startsWith("/") ? raw : "/" + raw;
    return { path, query, hash };
  }

  function matchRoute(path: string, entries: CompiledRouteEntry[]) {
    for (const entry of entries) {
      const m = entry.regex.exec(path);
      if (m) {
        const matched = entry.chain.map((r) => r.aliasOf ?? r);
        const leaf = matched[matched.length - 1];
        const name = leaf?.name;
        const params: RouteParams = {};
        entry.paramKeys.forEach((keyInfo, i) => {
          const rawVal = m[i + 1];
          if (rawVal === undefined) {
            if (keyInfo.repeatable) params[keyInfo.name] = [];
            return;
          }
          if (keyInfo.repeatable) {
            params[keyInfo.name] = rawVal
              .split("/")
              .map((part) => decodeURIComponent(part));
          } else {
            params[keyInfo.name] = decodeURIComponent(rawVal);
          }
        });
        return { matched, name, params };
      }
    }
    return {
      matched: [] as RouteRecordNormalized[],
      name: undefined as RouteRecordName | null | undefined,
      params: {} as RouteParams,
    };
  }

  function resolve(
    rawLocation: RouteLocationRaw,
    currentLocation: RouteLocationNormalizedLoaded = currentRoute.value,
  ): RouteLocationNormalized & { href: string } {
    let path = "/";
    let query: LocationQuery = {};
    let hash = "";
    let params: RouteParams = {};
    let matched: RouteRecordNormalized[] = [];
    let name: RouteRecordName | null | undefined;

    if (typeof rawLocation === "string") {
      ({ path, query, hash } = resolveStringLocation(
        rawLocation,
        currentLocation,
        parseQueryFn,
      ));
    } else if ("name" in rawLocation && rawLocation.name !== undefined) {
      ({ path, params, matched, name, query, hash } = resolveNamedLocation(
        rawLocation as RouteLocationNamedRaw,
        currentLocation,
        namedMap,
        buildPathFromEntry,
        parseQueryFn,
        stringifyQueryFn,
      ));
    } else if ("path" in rawLocation) {
      ({ path, query, hash } = resolvePathLocation(
        rawLocation as RouteLocationPathRaw,
        parseQueryFn,
        stringifyQueryFn,
      ));
    }

    if (matched.length === 0) {
      ({ matched, name, params } = matchRoute(path, entries));
    }

    const meta: RouteMeta = {};
    for (const record of matched) {
      Object.assign(meta, record.meta);
    }

    const queryString = stringifyQueryFn(query);
    const fullPath =
      path + (queryString ? `?${queryString}` : "") + (hash || "");
    const href = routerHistory.createHref(fullPath);

    return {
      path,
      fullPath,
      name,
      params,
      query,
      hash,
      matched,
      meta,
      redirectedFrom: undefined,
      href,
    };
  }

  async function runGuardQueue(
    guards: NavigationGuard[],
    to: RouteLocationNormalized,
    from: RouteLocationNormalizedLoaded,
  ): Promise<NavigationGuardReturn> {
    for (const guard of guards) {
      let nextCalled = false;
      let nextArg: any;
      const next: NavigationGuardNext = (arg?: any) => {
        nextCalled = true;
        nextArg = arg;
      };
      const ret = await guard(to, from, next);
      const outcome = nextCalled ? nextArg : ret;
      if (outcome === false) return false;
      if (outcome instanceof Error) throw outcome;
      if (
        typeof outcome === "string" ||
        (typeof outcome === "object" &&
          outcome !== null &&
          ("path" in outcome || "name" in outcome))
      ) {
        return outcome as RouteLocationRaw;
      }
    }
    return undefined;
  }

  async function navigate(
    rawTo: RouteLocationRaw,
    replaceFlag: boolean,
    redirectedFrom?: RouteLocationNormalized,
  ): Promise<NavigationFailure | void | undefined> {
    const navId = ++currentNavigationId;
    const from = currentRoute.value;
    let to: RouteLocationNormalized & { href: string };
    try {
      to = resolve(rawTo, from);
    } catch (err) {
      markReady(err);
      for (const handler of Array.from(errorHandlers)) {
        handler(err, START_LOCATION, from);
      }
      throw err;
    }

    if (redirectedFrom) {
      to.redirectedFrom = redirectedFrom;
    }

    const force =
      typeof rawTo === "object" && rawTo !== null && "force" in rawTo
        ? Boolean(rawTo.force)
        : false;
    const shouldReplace =
      replaceFlag ||
      (typeof rawTo === "object" && rawTo !== null && "replace" in rawTo
        ? Boolean(rawTo.replace)
        : false);

    if (
      !force &&
      from !== START_LOCATION &&
      to.fullPath === from.fullPath &&
      !redirectedFrom
    ) {
      const failure = createRouterError(
        NavigationFailureType.duplicated,
        from,
        to,
      );
      markReady();
      for (const hook of Array.from(afterHooks)) {
        hook(to, from, failure);
      }
      return failure;
    }

    const leafRecord = to.matched[to.matched.length - 1];
    if (leafRecord?.redirect) {
      const redirectTarget =
        typeof leafRecord.redirect === "function"
          ? leafRecord.redirect(to)
          : leafRecord.redirect;
      return navigate(redirectTarget, shouldReplace, redirectedFrom ?? to);
    }

    const toMatchedRaw = to.matched.map((r) => toRaw(r));
    const fromMatchedRaw = from.matched.map((r) => toRaw(r));
    const leavingRecords = fromMatchedRaw.filter(
      (record) => !toMatchedRaw.includes(record),
    );
    const updatingRecords = fromMatchedRaw.filter((record) =>
      toMatchedRaw.includes(record),
    );
    const enteringRecords = toMatchedRaw.filter(
      (record) => !fromMatchedRaw.includes(record),
    );

    const guards: NavigationGuard[] = [];
    for (const record of leavingRecords.toReversed()) {
      for (const g of record.leaveGuards) guards.push(g);
    }
    for (const g of beforeGuards) {
      guards.push(g);
    }
    for (const record of updatingRecords) {
      for (const g of record.updateGuards) guards.push(g);
    }
    for (const record of enteringRecords) {
      for (const g of record.beforeGuards) guards.push(g);
    }
    for (const g of beforeResolveGuards) {
      guards.push(g);
    }

    let guardResult: NavigationGuardReturn;
    try {
      guardResult = await runGuardQueue(guards, to, from);
    } catch (err) {
      markReady(err);
      for (const handler of Array.from(errorHandlers)) {
        handler(err, to, from);
      }
      throw err;
    }

    if (navId !== currentNavigationId) {
      return createRouterError(NavigationFailureType.cancelled, from, to);
    }

    if (guardResult === false) {
      const failure = createRouterError(
        NavigationFailureType.aborted,
        from,
        to,
      );
      markReady();
      for (const hook of Array.from(afterHooks)) {
        hook(to, from, failure);
      }
      return failure;
    }

    if (
      typeof guardResult === "string" ||
      (typeof guardResult === "object" &&
        guardResult !== null &&
        ("path" in guardResult || "name" in guardResult))
    ) {
      return navigate(guardResult, shouldReplace, redirectedFrom ?? to);
    }

    const stateData =
      typeof rawTo === "object" && rawTo !== null && "state" in rawTo
        ? rawTo.state
        : undefined;
    if (shouldReplace || from === START_LOCATION) {
      routerHistory.replace(to.fullPath, stateData);
    } else {
      routerHistory.push(to.fullPath, stateData);
    }

    currentRoute.value = to;
    markReady();

    for (const hook of Array.from(afterHooks)) {
      hook(to, from, undefined);
    }
    return undefined;
  }

  let removeHistoryListener: (() => void) | undefined;

  function setupListeners() {
    if (removeHistoryListener) return;
    removeHistoryListener = routerHistory.listen((to) => {
      void navigate(to, true);
    });
  }

  const initialLocation = resolve(
    routerHistory.location || "/",
    START_LOCATION,
  );
  const initialLeaf =
    initialLocation.matched[initialLocation.matched.length - 1];
  if (initialLeaf?.redirect) {
    const redirectTarget =
      typeof initialLeaf.redirect === "function"
        ? initialLeaf.redirect(initialLocation)
        : initialLeaf.redirect;
    try {
      const redirected = resolve(redirectTarget, initialLocation);
      redirected.redirectedFrom = initialLocation;
      currentRoute.value = redirected;
      routerHistory.replace(redirected.fullPath);
    } catch {
      currentRoute.value = initialLocation;
    }
  } else {
    currentRoute.value = initialLocation;
  }

  const router: Router = {
    currentRoute,
    options,
    listening: true,
    addRoute(
      parentOrRoute: RouteRecordName | RouteRecordRaw,
      maybeRoute?: RouteRecordRaw,
    ) {
      if (typeof parentOrRoute === "object" && parentOrRoute !== null) {
        return insertRouteRecord(parentOrRoute);
      }
      const parentEntry = namedMap.get(parentOrRoute);
      if (!parentEntry || !maybeRoute) {
        throw new Error(
          `Parent route "${String(parentOrRoute)}" not found for addRoute`,
        );
      }
      return insertRouteRecord(maybeRoute, parentEntry);
    },
    removeRoute(name) {
      const entry = namedMap.get(name);
      if (!entry) return;
      namedMap.delete(name);
      const toRemove = entries.filter((e) => e.chain.includes(entry.record));
      for (const item of toRemove) {
        const idx = entries.indexOf(item);
        if (idx >= 0) entries.splice(idx, 1);
        if (item.record.name !== undefined) {
          namedMap.delete(item.record.name);
        }
      }
    },
    hasRoute(name) {
      return namedMap.has(name);
    },
    getRoutes() {
      return entries.filter((e) => !e.record.aliasOf).map((e) => e.record);
    },
    resolve,
    push(to) {
      setupListeners();
      return navigate(to, false);
    },
    replace(to) {
      setupListeners();
      return navigate(to, true);
    },
    back() {
      return this.go(-1);
    },
    forward() {
      return this.go(1);
    },
    go(delta) {
      setupListeners();
      routerHistory.go(delta, true);
    },
    beforeEach(guard) {
      beforeGuards.add(guard);
      return () => {
        beforeGuards.delete(guard);
      };
    },
    beforeResolve(guard) {
      beforeResolveGuards.add(guard);
      return () => {
        beforeResolveGuards.delete(guard);
      };
    },
    afterEach(hook) {
      afterHooks.add(hook);
      return () => {
        afterHooks.delete(hook);
      };
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },
    isReady() {
      if (ready && currentRoute.value !== START_LOCATION) {
        return Promise.resolve();
      }
      ready = true;
      return Promise.resolve();
    },
    install(app?: any) {
      setActiveRouter(router);
      setupListeners();
      const reactiveRoute = createReactiveRouteProxy(currentRoute);
      if (app && typeof app === "object") {
        if (typeof app.provide === "function") {
          app.provide(routerKey, router);
          app.provide(routerViewLocationKey, currentRoute);
          app.provide(routeLocationKey, reactiveRoute);
        }
        if (typeof app.component === "function") {
          app.component("RouterLink", RouterLink);
          app.component("RouterView", RouterView);
        }
        if (app.config && app.config.globalProperties) {
          app.config.globalProperties.$router = router;
          Object.defineProperty(app.config.globalProperties, "$route", {
            enumerable: true,
            configurable: true,
            get: () => currentRoute.value,
          });
        }
      }
      if (peekComponentContext()) {
        provide(routerKey, router);
        provide(routerViewLocationKey, currentRoute);
        provide(routeLocationKey, reactiveRoute);
      }
    },
  };

  setActiveRouter(router);
  setupListeners();
  return router;
}

const reactiveRouteProxies = new WeakMap<
  Ref<RouteLocationNormalizedLoaded>,
  RouteLocationNormalizedLoaded
>();

function createReactiveRouteProxy(
  routeRef: Ref<RouteLocationNormalizedLoaded>,
): RouteLocationNormalizedLoaded {
  const existing = reactiveRouteProxies.get(routeRef);
  if (existing) return existing;
  const proxy = new Proxy({} as RouteLocationNormalizedLoaded, {
    get(_target, prop, receiver) {
      return Reflect.get(routeRef.value, prop, receiver);
    },
    has(_target, prop) {
      return Reflect.has(routeRef.value, prop);
    },
    ownKeys() {
      return Reflect.ownKeys(routeRef.value);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const desc = Reflect.getOwnPropertyDescriptor(routeRef.value, prop);
      if (desc) return { ...desc, configurable: true };
      return undefined;
    },
  });
  reactiveRouteProxies.set(routeRef, proxy);
  return proxy;
}

export function useRouter(): Router {
  if (hasInjectionContext()) {
    const injected = inject(routerKey);
    if (injected) return injected;
  }
  if (activeRouter) return activeRouter;
  throw new Error(
    "useRouter() requires an active Router instance (call createRouter() first)",
  );
}

export function useRoute(): RouteLocationNormalizedLoaded {
  if (hasInjectionContext()) {
    const injected = inject(routeLocationKey);
    if (injected) return injected;
  }
  const router = useRouter();
  return createReactiveRouteProxy(router.currentRoute);
}

export function onBeforeRouteLeave(leaveGuard: NavigationGuard): void {
  const router = useRouter();
  const current = untrack(() => router.currentRoute.value);
  const leaf = current.matched[current.matched.length - 1];
  if (leaf) {
    leaf.leaveGuards.add(leaveGuard);
    if (getOwner()) {
      onCleanup(() => {
        leaf.leaveGuards.delete(leaveGuard);
      });
    }
    return;
  }
  const remove = router.beforeEach((to, from, next) => {
    if (to.path !== from.path) {
      return leaveGuard(to, from, next);
    }
    next();
  });
  if (getOwner()) {
    onCleanup(remove);
  }
}

export function onBeforeRouteUpdate(updateGuard: NavigationGuard): void {
  const router = useRouter();
  const current = untrack(() => router.currentRoute.value);
  const leaf = current.matched[current.matched.length - 1];
  if (leaf) {
    leaf.updateGuards.add(updateGuard);
    if (getOwner()) {
      onCleanup(() => {
        leaf.updateGuards.delete(updateGuard);
      });
    }
    return;
  }
  const remove = router.beforeEach((to, from, next) => {
    if (to.matched.some((r) => from.matched.includes(r))) {
      return updateGuard(to, from, next);
    }
    next();
  });
  if (getOwner()) {
    onCleanup(remove);
  }
}

export interface UseLinkOptions {
  to: MaybeRef<RouteLocationRaw>;
  replace?: MaybeRef<boolean | undefined>;
}

export interface UseLinkReturn {
  route: Readonly<Ref<RouteLocationNormalized & { href: string }>>;
  href: Readonly<Ref<string>>;
  isActive: Readonly<Ref<boolean>>;
  isExactActive: Readonly<Ref<boolean>>;
  navigate: (e?: MouseEvent) => Promise<void | NavigationFailure>;
}

export function useLink(props: UseLinkOptions): UseLinkReturn {
  const router = useRouter();
  const currentRoute = router.currentRoute;

  const route = computed(() => router.resolve(unref(props.to)));
  const href = computed(() => route.value.href);
  const isExactActive = computed(
    () => currentRoute.value.fullPath === route.value.fullPath,
  );
  const isActive = computed(() => {
    const currentPath = currentRoute.value.path;
    const targetPath = route.value.path;
    if (targetPath === "/") return currentPath === "/";
    return (
      currentPath === targetPath || currentPath.startsWith(targetPath + "/")
    );
  });

  const navigate = (e?: MouseEvent): Promise<void | NavigationFailure> => {
    if (e) {
      if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) {
        return Promise.resolve();
      }
      if (e.defaultPrevented) return Promise.resolve();
      if (e.button !== undefined && e.button !== 0) return Promise.resolve();
      if (typeof e.preventDefault === "function") e.preventDefault();
    }
    const to = unref(props.to);
    return unref(props.replace) ? router.replace(to) : router.push(to);
  };

  return {
    route,
    href,
    isActive,
    isExactActive,
    navigate,
  };
}

export interface RouterLinkProps {
  to: RouteLocationRaw;
  replace?: boolean;
  activeClass?: string;
  exactActiveClass?: string;
  ariaCurrentValue?:
    "page" | "step" | "location" | "date" | "time" | "true" | "false";
  custom?: boolean;
  label?: string;
  children?: any;
  [key: string]: any;
}

function isSSRMode(): boolean {
  const frame = peekComponentContext();
  return frame?.mode === "ssr" || isSSRRendering();
}

export function RouterLink(props: RouterLinkProps): any {
  const router = useRouter();
  const link = useLink({
    to: computed(() => props.to),
    replace: computed(() => props.replace),
  });
  const frame = peekComponentContext();
  const slotFactory = getDefaultSlotFactory(props, frame);

  const computeClass = () => {
    const classes: string[] = [];
    if (typeof props.class === "string" && props.class) {
      classes.push(props.class);
    }
    const activeCls =
      props.activeClass ??
      router.options.linkActiveClass ??
      "router-link-active";
    const exactCls =
      props.exactActiveClass ??
      router.options.linkExactActiveClass ??
      "router-link-exact-active";
    if (link.isActive.value && activeCls) classes.push(activeCls);
    if (link.isExactActive.value && exactCls) classes.push(exactCls);
    return classes.join(" ") || undefined;
  };

  const resolveChildren = () => {
    if (slotFactory) return slotFactory();
    if (typeof props.children === "function") return props.children(link);
    if (props.children !== undefined) return props.children;
    if (props.label !== undefined) return props.label;
    return link.href.value;
  };

  if (props.custom) {
    return resolveChildren();
  }

  if (isSSRMode()) {
    return hSSR(
      "a",
      {
        href: link.href.value,
        class: computeClass(),
        "aria-current": link.isExactActive.value
          ? (props.ariaCurrentValue ?? "page")
          : undefined,
      },
      resolveChildren(),
    );
  }

  return hDOM(
    "a",
    {
      get href() {
        return link.href.value;
      },
      get class() {
        return computeClass();
      },
      get "aria-current"() {
        return link.isExactActive.value
          ? (props.ariaCurrentValue ?? "page")
          : undefined;
      },
      onClick: (e: MouseEvent) => {
        void link.navigate(e);
      },
    },
    resolveChildren(),
  );
}

export interface RouterViewProps {
  name?: string;
  route?: RouteLocationNormalizedLoaded;
}

export function RouterView(props: RouterViewProps = {}): any {
  const router = useRouter();
  const frame = peekComponentContext();
  const depth = frame ? (inject(viewDepthKey, 0) ?? 0) : 0;
  if (frame) {
    provide(viewDepthKey, depth + 1);
    provide(routerKey, router);
    provide(routeLocationKey, createReactiveRouteProxy(router.currentRoute));
  }

  const viewName = props.name ?? "default";
  const slotFactory = getDefaultSlotFactory(props, frame);

  const renderMatched = () => {
    const current = props.route ?? router.currentRoute.value;
    const matchedRecord = current.matched[depth];
    if (!matchedRecord) {
      return slotFactory ? slotFactory() : null;
    }
    const ViewComponent = matchedRecord.components[viewName];
    if (!ViewComponent) {
      return null;
    }

    const rawPropsOption = matchedRecord.props[viewName];
    let routeProps: Record<string, any> = {};
    if (rawPropsOption === true) {
      routeProps = { ...current.params };
    } else if (typeof rawPropsOption === "function") {
      routeProps = rawPropsOption(current) ?? {};
    } else if (rawPropsOption && typeof rawPropsOption === "object") {
      routeProps = { ...rawPropsOption };
    }

    if (isSSRMode()) {
      return hSSR(ViewComponent, routeProps);
    }
    return hDOM(ViewComponent, routeProps);
  };

  if (isSSRMode()) {
    return renderMatched();
  }
  return () => renderMatched();
}
