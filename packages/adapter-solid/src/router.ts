/**
 * Host-free `@solidjs/router` replacement on the Moonshine reactive graph.
 * Provides `Router`, `MemoryRouter`, `HashRouter`, `Route`, `A`, `Navigate`,
 * `createMemoryHistory`, `useNavigate`, `useLocation`, `useParams`,
 * `useSearchParams`, `useIsRouting`, `useMatch`, `useCurrentMatches`,
 * `useBeforeLeave`, `usePreloadRoute`, `query`, `createAsync`,
 * `createAsyncStore`, `revalidate`, `action`, `useAction`, `useSubmission`,
 * `useSubmissions`, `redirect`, `reload`, and `json`.
 */
import {
  batch,
  createComputed,
  createMemo,
  createSignal,
  getOwner,
  onCleanup,
  untrack,
  type Accessor,
} from "@tschk/moonshine-dom/reactive";
import { h as hSSR } from "@tschk/moonshine-dom/ssr";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { createStore, reconcile } from "@tschk/moonshine-dom/store";
import { h as hDOM } from "./component-factory";
import { createContext, useContext } from "./context";

export type Params = Record<string, string>;

export type MatchFilter = readonly string[] | RegExp | ((s: string) => boolean);

export type MatchFilters<P extends string = string> = {
  [K in P]?: MatchFilter;
};

export interface Path {
  pathname: string;
  search: string;
  hash: string;
}

export interface Location<S = unknown> extends Path {
  readonly query: Params;
  readonly state: Readonly<Partial<S>> | null;
  readonly key: string;
}

export interface NavigateOptions<S = unknown> {
  resolve?: boolean;
  replace?: boolean;
  scroll?: boolean;
  state?: S;
}

export interface Navigator {
  (to: string, options?: Partial<NavigateOptions>): void;
  (delta: number): void;
}

export interface BeforeLeaveEventArgs {
  from: Location;
  to: string | number;
  options?: Partial<NavigateOptions>;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  retry(force?: boolean): void;
}

export interface PathMatch {
  params: Params;
  path: string;
}

export interface RouteMatch extends PathMatch {
  route: RouteDefinition;
}

export interface RouteLoadFuncArgs {
  params: Params;
  location: Location;
  intent: "initial" | "navigate" | "native" | "preload";
}

export type RouteLoadFunc<T = unknown> = (args: RouteLoadFuncArgs) => T;

export interface RouteDefinition<P extends string = string, T = unknown> {
  path?: P | P[];
  component?: (props: any) => any;
  load?: RouteLoadFunc<T>;
  preload?: RouteLoadFunc<T>;
  matchFilters?: MatchFilters;
  info?: Record<string, any>;
  children?: RouteDefinition | RouteDefinition[];
}

export interface RouteProps<
  P extends string = string,
  T = unknown,
> extends RouteDefinition<P, T> {}

export interface RouteSectionProps<T = unknown> {
  params: Params;
  location: Location;
  data?: T;
  children?: any;
}

const ROUTE_DEF_SYMBOL = /* @__PURE__ */ Symbol("moonshine.solid.route");

export function Route<P extends string = string, T = unknown>(
  props: RouteProps<P, T>,
): RouteDefinition<P, T> {
  return Object.assign({ [ROUTE_DEF_SYMBOL]: true }, props);
}

export interface MemoryHistory {
  get(): string;
  set(options: {
    value: string;
    state?: any;
    replace?: boolean;
    scroll?: boolean;
  }): void;
  back(): void;
  forward(): void;
  go(delta: number): void;
  listen(listener: (value: string) => void): () => void;
}

export function createMemoryHistory(initial = "/"): MemoryHistory {
  const entries: Array<{ value: string; state: any }> = [
    { value: initial || "/", state: null },
  ];
  let index = 0;
  const listeners = new Set<(value: string) => void>();

  const notify = () => {
    const current = entries[index]?.value ?? "/";
    for (const cb of Array.from(listeners)) {
      cb(current);
    }
  };

  return {
    get() {
      return entries[index]?.value ?? "/";
    },
    set({ value, state = null, replace = false }) {
      const normalized = value.startsWith("/") ? value : "/" + value;
      if (replace) {
        entries[index] = { value: normalized, state };
      } else {
        entries.splice(index + 1);
        entries.push({ value: normalized, state });
        index = entries.length - 1;
      }
      notify();
    },
    back() {
      this.go(-1);
    },
    forward() {
      this.go(1);
    },
    go(delta: number) {
      const next = Math.max(0, Math.min(entries.length - 1, index + delta));
      if (next !== index) {
        index = next;
        notify();
      }
    },
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function parseSearchParams(search: string): Params {
  const out: Params = {};
  const cleaned = search.replace(/^\?/, "");
  if (!cleaned) return out;
  for (const pair of cleaned.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawVal = eq >= 0 ? pair.slice(eq + 1) : "";
    const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
    const val = decodeURIComponent(rawVal.replace(/\+/g, " "));
    out[key] = val;
  }
  return out;
}

function stringifySearchParams(params: Record<string, any>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null && item !== "") {
          parts.push(
            `${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`,
          );
        }
      }
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function parseFullUrl(raw: string): {
  pathname: string;
  search: string;
  hash: string;
} {
  let working = raw || "/";
  let hash = "";
  let search = "";
  const hashIdx = working.indexOf("#");
  if (hashIdx >= 0) {
    hash = working.slice(hashIdx);
    working = working.slice(0, hashIdx);
  }
  const searchIdx = working.indexOf("?");
  if (searchIdx >= 0) {
    search = working.slice(searchIdx);
    working = working.slice(0, searchIdx);
  }
  const pathname = working.startsWith("/") ? working : "/" + working;
  return { pathname: pathname || "/", search, hash };
}

function joinRoutePaths(parent: string, child: string): string {
  if (!child) return parent || "/";
  if (child.startsWith("/")) {
    if (!parent || parent === "/") return child;
    return `${parent.replace(/\/+$/, "")}/${child.replace(/^\/+/, "")}`;
  }
  const base = parent.replace(/\/+$/, "");
  return `${base}/${child}`.replace(/\/+/g, "/");
}

function matchPattern(
  pattern: string,
  pathname: string,
  filters?: MatchFilters,
  end = true,
): PathMatch | undefined {
  const normPattern = pattern === "" ? "/" : pattern;
  const patternSegs = normPattern
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  const pathSegs = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  const params: Params = {};
  let pi = 0;
  let si = 0;

  while (pi < patternSegs.length) {
    const pSeg = patternSegs[pi]!;
    if (pSeg.startsWith("*")) {
      const paramName = pSeg.slice(1) || "*";
      params[paramName] = pathSegs
        .slice(si)
        .map((s) => decodeURIComponent(s))
        .join("/");
      si = pathSegs.length;
      pi++;
      break;
    }
    if (pSeg.startsWith(":")) {
      const isOptional = pSeg.endsWith("?");
      const paramName = pSeg.slice(1, isOptional ? -1 : undefined);
      if (si >= pathSegs.length) {
        if (isOptional) {
          pi++;
          continue;
        }
        return undefined;
      }
      const value = decodeURIComponent(pathSegs[si]!);
      if (filters && paramName in filters) {
        const filter = filters[paramName];
        if (Array.isArray(filter)) {
          if (!filter.includes(value)) return undefined;
        } else if (filter instanceof RegExp) {
          if (!filter.test(value)) return undefined;
        } else if (typeof filter === "function") {
          if (!filter(value)) return undefined;
        }
      }
      params[paramName] = value;
      si++;
      pi++;
      continue;
    }
    if (si >= pathSegs.length || pSeg !== pathSegs[si]) {
      return undefined;
    }
    si++;
    pi++;
  }

  if (end && si < pathSegs.length) {
    return undefined;
  }

  const matchedPath = "/" + pathSegs.slice(0, si).join("/");
  return {
    params,
    path: matchedPath,
  };
}

interface FlattenedRoute {
  fullPath: string;
  chain: RouteDefinition[];
  score: number;
}

function normalizeRouteTree(
  input: any,
  parentPath = "",
  parentChain: RouteDefinition[] = [],
  out: FlattenedRoute[] = [],
): FlattenedRoute[] {
  if (!input) return out;
  if (typeof input === "function" && !(ROUTE_DEF_SYMBOL in input)) {
    return normalizeRouteTree(input(), parentPath, parentChain, out);
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      normalizeRouteTree(item, parentPath, parentChain, out);
    }
    return out;
  }
  if (typeof input === "object") {
    const def = input as RouteDefinition;
    const rawPaths = Array.isArray(def.path) ? def.path : [def.path ?? ""];
    for (const rawPath of rawPaths) {
      const fullPath = joinRoutePaths(parentPath, rawPath);
      const nextChain = [...parentChain, def];
      const hasChildren = Boolean(def.children);
      if (def.component || !hasChildren) {
        const segs = fullPath
          .replace(/^\/+|\/+$/g, "")
          .split("/")
          .filter(Boolean);
        let score = segs.length === 0 ? 50 : 0;
        for (const s of segs) {
          if (s.startsWith("*")) score += 1;
          else if (s.startsWith(":") && s.endsWith("?")) score += 8;
          else if (s.startsWith(":")) score += 10;
          else score += 20;
        }
        out.push({ fullPath, chain: nextChain, score });
      }
      if (hasChildren) {
        normalizeRouteTree(def.children, fullPath, nextChain, out);
      }
    }
  }
  return out;
}

interface RouterInstanceContext {
  base: string;
  location: Location<any>;
  params: Params;
  matches: Accessor<RouteMatch[]>;
  isRouting: Accessor<boolean>;
  navigate: Navigator;
  beforeLeaveListeners: Set<(e: BeforeLeaveEventArgs) => void>;
  preloadRoute: (
    url: string | URL,
    options?: { preloadData?: boolean },
  ) => void;
  createHref: (to: string) => string;
}

const RouterContext = createContext<RouterInstanceContext | undefined>(
  undefined,
);

let activeRouterContext: RouterInstanceContext | undefined;

function getRouterContext(caller: string): RouterInstanceContext {
  const ctx = useContext(RouterContext) ?? activeRouterContext;
  if (!ctx) {
    throw new Error(
      `${caller}() requires a <Router>, <MemoryRouter>, or <HashRouter> context`,
    );
  }
  return ctx;
}

export interface BaseRouterProps {
  base?: string;
  root?: (props: RouteSectionProps) => any;
  children?: any;
  explicitLinks?: boolean;
  preload?: boolean;
  url?: string;
}

export interface RouterProps extends BaseRouterProps {}

export interface MemoryRouterProps extends BaseRouterProps {
  history?: MemoryHistory;
}

export interface HashRouterProps extends BaseRouterProps {}

function createRouterInstance(
  props: BaseRouterProps & {
    history?: MemoryHistory;
    hashMode?: boolean;
  },
): RouterInstanceContext {
  const base = (props.base ?? "").replace(/\/+$/, "");
  const initialUrl =
    props.url ??
    props.history?.get() ??
    (typeof window !== "undefined" && window.location
      ? props.hashMode
        ? window.location.hash.replace(/^#/, "") || "/"
        : (window.location.pathname.startsWith(base)
            ? window.location.pathname.slice(base.length) || "/"
            : window.location.pathname || "/") +
          (window.location.search || "") +
          (window.location.hash || "")
      : "/");

  const history = props.history ?? createMemoryHistory(initialUrl);
  const [rawUrl, setRawUrl] = createSignal(parseFullUrl(initialUrl));
  const [historyState, setHistoryState] = createSignal<any>(null);
  const [keyCounter, setKeyCounter] = createSignal(0);
  const [isRouting] = createSignal(false);
  const beforeLeaveListeners = new Set<(e: BeforeLeaveEventArgs) => void>();

  const stopHistory = history.listen((nextVal) => {
    batch(() => {
      setRawUrl(parseFullUrl(nextVal));
      setKeyCounter((k) => k + 1);
    });
  });
  if (getOwner()) {
    onCleanup(stopHistory);
  }

  const queryMemo = createMemo(() => parseSearchParams(rawUrl().search));

  const location: Location<any> = {
    get pathname() {
      return rawUrl().pathname;
    },
    get search() {
      return rawUrl().search;
    },
    get hash() {
      return rawUrl().hash;
    },
    get query() {
      return queryMemo();
    },
    get state() {
      return historyState();
    },
    get key() {
      return `k-${keyCounter()}`;
    },
  };

  const flattenedRoutes = createMemo(() => {
    const list = normalizeRouteTree(props.children);
    return list.sort((a, b) => b.score - a.score);
  });

  const currentMatchResult = createMemo<{
    matches: RouteMatch[];
    params: Params;
  }>(() => {
    const pathname = rawUrl().pathname;
    const candidates = flattenedRoutes();
    for (const candidate of candidates) {
      let combinedFilters: MatchFilters = {};
      for (const r of candidate.chain) {
        if (r.matchFilters) {
          combinedFilters = { ...combinedFilters, ...r.matchFilters };
        }
      }
      const m = matchPattern(
        candidate.fullPath,
        pathname,
        combinedFilters,
        true,
      );
      if (m) {
        const matches: RouteMatch[] = candidate.chain.map((route) => ({
          route,
          params: m.params,
          path: m.path,
        }));
        return { matches, params: m.params };
      }
    }
    return { matches: [], params: {} };
  });

  const paramsProxy = new Proxy({} as Params, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return currentMatchResult().params[prop];
    },
    has(_target, prop) {
      if (typeof prop !== "string") return false;
      return prop in currentMatchResult().params;
    },
    ownKeys() {
      return Reflect.ownKeys(currentMatchResult().params);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const p = currentMatchResult().params;
      if (typeof prop === "string" && prop in p) {
        return {
          enumerable: true,
          configurable: true,
          writable: false,
          value: p[prop],
        };
      }
      return undefined;
    },
  });

  const performNavigation = (
    to: string | number,
    options?: Partial<NavigateOptions>,
    force = false,
  ) => {
    if (!force && beforeLeaveListeners.size > 0) {
      let prevented = false;
      const ev: BeforeLeaveEventArgs = {
        from: location,
        to,
        options,
        get defaultPrevented() {
          return prevented;
        },
        preventDefault() {
          prevented = true;
        },
        retry(retryForce = false) {
          performNavigation(to, options, retryForce);
        },
      };
      for (const listener of Array.from(beforeLeaveListeners)) {
        listener(ev);
      }
      if (prevented) return;
    }

    if (typeof to === "number") {
      history.go(to);
      return;
    }

    let resolvedPath = to;
    if (!to.startsWith("/") && !to.startsWith("?") && !to.startsWith("#")) {
      const currentDir = untrack(() => location.pathname).replace(
        /\/[^/]*$/,
        "",
      );
      resolvedPath = `${currentDir}/${to}`.replace(/\/+/g, "/");
    } else if (to.startsWith("?") || to.startsWith("#")) {
      resolvedPath = untrack(() => location.pathname) + to;
    }

    batch(() => {
      if (options && "state" in options) {
        setHistoryState(() => options.state ?? null);
      } else {
        setHistoryState(null);
      }
      history.set({
        value: resolvedPath,
        state: options?.state ?? null,
        replace: options?.replace ?? false,
        scroll: options?.scroll ?? true,
      });
    });

    if (typeof window !== "undefined" && window.history && !props.history) {
      try {
        const href = createHref(resolvedPath);
        if (options?.replace) {
          window.history.replaceState(options?.state ?? null, "", href);
        } else {
          window.history.pushState(options?.state ?? null, "", href);
        }
      } catch {
        // Ignore in synthetic DOM
      }
    }
  };

  const navigate: Navigator = ((
    toOrDelta: string | number,
    options?: Partial<NavigateOptions>,
  ) => {
    performNavigation(toOrDelta, options, false);
  }) as Navigator;

  const createHref = (to: string): string => {
    const normalized = to.startsWith("/") ? to : "/" + to;
    if (props.hashMode) {
      return `${base}#${normalized}`;
    }
    return `${base}${normalized}`;
  };

  const preloadRoute = (
    url: string | URL,
    options?: { preloadData?: boolean },
  ) => {
    const raw =
      typeof url === "string" ? url : url.pathname + url.search + url.hash;
    const parsed = parseFullUrl(raw);
    const candidates = untrack(flattenedRoutes);
    for (const candidate of candidates) {
      const m = matchPattern(
        candidate.fullPath,
        parsed.pathname,
        undefined,
        true,
      );
      if (m) {
        if (options?.preloadData !== false) {
          for (const route of candidate.chain) {
            const preloadFn = route.preload ?? route.load;
            if (preloadFn) {
              preloadFn({
                params: m.params,
                location: {
                  ...location,
                  pathname: parsed.pathname,
                  search: parsed.search,
                  hash: parsed.hash,
                  query: parseSearchParams(parsed.search),
                },
                intent: "preload",
              });
            }
          }
        }
        break;
      }
    }
  };

  const ctx: RouterInstanceContext = {
    base,
    location,
    params: paramsProxy,
    matches: () => currentMatchResult().matches,
    isRouting,
    navigate,
    beforeLeaveListeners,
    preloadRoute,
    createHref,
  };

  activeRouterContext = ctx;
  return ctx;
}

function renderRouterTree(
  ctx: RouterInstanceContext,
  rootComponent?: (props: RouteSectionProps) => any,
): any {
  const isSSR = isSSRRendering();
  const h: (...args: any[]) => any = isSSR ? hSSR : hDOM;

  const renderMatches = () => {
    const matches = ctx.matches();
    let rendered: any = null;

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i]!;
      const Comp = match.route.component;
      const loadFn = match.route.preload ?? match.route.load;
      const data = loadFn
        ? untrack(() =>
            loadFn({
              params: ctx.params,
              location: ctx.location,
              intent: "initial",
            }),
          )
        : undefined;
      if (Comp) {
        const child = rendered;
        rendered = h(Comp, {
          params: ctx.params,
          location: ctx.location,
          data,
          children: child,
        });
      }
    }

    if (rootComponent) {
      return h(rootComponent, {
        params: ctx.params,
        location: ctx.location,
        children: rendered,
      });
    }
    return rendered;
  };

  return h(RouterContext.Provider, {
    value: ctx,
    get children() {
      return isSSR ? renderMatches() : () => renderMatches();
    },
  });
}

export function Router(props: RouterProps): any {
  const ctx = createRouterInstance(props);
  return renderRouterTree(ctx, props.root);
}

export function MemoryRouter(props: MemoryRouterProps): any {
  const ctx = createRouterInstance(props);
  return renderRouterTree(ctx, props.root);
}

export function HashRouter(props: HashRouterProps): any {
  const ctx = createRouterInstance({ ...props, hashMode: true });
  return renderRouterTree(ctx, props.root);
}

export function useNavigate(): Navigator {
  return getRouterContext("useNavigate").navigate;
}

export function useLocation<S = unknown>(): Location<S> {
  return getRouterContext("useLocation").location as Location<S>;
}

export function useParams<T extends Params = Params>(): T {
  return getRouterContext("useParams").params as T;
}

export function useSearchParams<
  T extends Record<string, string | string[] | undefined> = Record<
    string,
    string | undefined
  >,
>(): [
  T,
  (vars: Record<string, any>, options?: Partial<NavigateOptions>) => void,
] {
  const ctx = getRouterContext("useSearchParams");
  const setSearchParams = (
    vars: Record<string, any>,
    options?: Partial<NavigateOptions>,
  ) => {
    const currentQuery = { ...untrack(() => ctx.location.query) };
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined || v === null || v === "") {
        delete currentQuery[k];
      } else {
        currentQuery[k] = String(v);
      }
    }
    const nextSearch = stringifySearchParams(currentQuery);
    const nextUrl =
      untrack(() => ctx.location.pathname) +
      nextSearch +
      untrack(() => ctx.location.hash);
    ctx.navigate(nextUrl, options);
  };
  return [ctx.location.query as unknown as T, setSearchParams];
}

export function useIsRouting(): Accessor<boolean> {
  return getRouterContext("useIsRouting").isRouting;
}

export function useCurrentMatches(): Accessor<RouteMatch[]> {
  return getRouterContext("useCurrentMatches").matches;
}

export function useMatch<S extends string>(
  path: () => S,
  matchFilters?: MatchFilters<S>,
): Accessor<PathMatch | undefined> {
  const ctx = getRouterContext("useMatch");
  return createMemo(() =>
    matchPattern(path(), ctx.location.pathname, matchFilters, true),
  );
}

export function useBeforeLeave(
  listener: (e: BeforeLeaveEventArgs) => void,
): void {
  const ctx = getRouterContext("useBeforeLeave");
  ctx.beforeLeaveListeners.add(listener);
  if (getOwner()) {
    onCleanup(() => {
      ctx.beforeLeaveListeners.delete(listener);
    });
  }
}

export function usePreloadRoute(): (
  url: string | URL,
  options?: { preloadData?: boolean },
) => void {
  return getRouterContext("usePreloadRoute").preloadRoute;
}

export interface AnchorProps {
  href: string;
  replace?: boolean;
  noScroll?: boolean;
  state?: unknown;
  inactiveClass?: string;
  activeClass?: string;
  end?: boolean;
  class?: string;
  children?: any;
  [key: string]: any;
}

export function A(props: AnchorProps): any {
  const ctx = getRouterContext("A");
  const isSSR = isSSRRendering();
  const h: (...args: any[]) => any = isSSR ? hSSR : hDOM;

  const isActive = createMemo(() => {
    const target = parseFullUrl(props.href).pathname;
    const current = ctx.location.pathname;
    if (props.end || target === "/") {
      return current === target;
    }
    return current === target || current.startsWith(target + "/");
  });

  const isExact = createMemo(() => {
    const target = parseFullUrl(props.href).pathname;
    return ctx.location.pathname === target;
  });

  const computeClass = () => {
    const classes: string[] = [];
    if (props.class) classes.push(props.class);
    const activeCls = props.activeClass ?? "active";
    const inactiveCls = props.inactiveClass ?? "inactive";
    if (isActive()) {
      if (activeCls) classes.push(activeCls);
    } else if (inactiveCls) {
      classes.push(inactiveCls);
    }
    return classes.join(" ") || undefined;
  };

  if (isSSR) {
    return h(
      "a",
      {
        href: ctx.createHref(props.href),
        class: computeClass(),
        "aria-current": isExact() ? "page" : undefined,
      },
      props.children,
    );
  }

  return h(
    "a",
    {
      get href() {
        return ctx.createHref(props.href);
      },
      get class() {
        return computeClass();
      },
      get "aria-current"() {
        return isExact() ? "page" : undefined;
      },
      onClick: (e: MouseEvent) => {
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.altKey ||
          e.ctrlKey ||
          e.shiftKey
        ) {
          return;
        }
        e.preventDefault();
        ctx.navigate(props.href, {
          replace: props.replace,
          scroll: !props.noScroll,
          state: props.state,
        });
      },
    },
    props.children,
  );
}

export interface NavigateProps {
  href:
    string | ((args: { navigate: Navigator; location: Location }) => string);
  state?: unknown;
}

export function Navigate(props: NavigateProps): null {
  const ctx = getRouterContext("Navigate");
  const target =
    typeof props.href === "function"
      ? props.href({ navigate: ctx.navigate, location: ctx.location })
      : props.href;
  ctx.navigate(target, { replace: true, state: props.state });
  return null;
}

// ============================================================================
// Data Loading (`query`, `createAsync`, `createAsyncStore`, `revalidate`)
// ============================================================================

export type CachedFunction<T extends (...args: any[]) => any> = T & {
  key: string;
  keyFor: (...args: Parameters<T>) => string;
};

interface CacheEntry {
  value?: any;
  hasValue: boolean;
  error?: any;
  inFlight?: Promise<any>;
  version: ReturnType<typeof createSignal<number>>;
}

const queryCache = new Map<string, CacheEntry>();

function getOrCreateCacheEntry(cacheKey: string): CacheEntry {
  let entry = queryCache.get(cacheKey);
  if (!entry) {
    entry = {
      hasValue: false,
      version: createSignal(0, { equals: false }),
    };
    queryCache.set(cacheKey, entry);
  }
  return entry;
}

export function query<T extends (...args: any[]) => any>(
  fn: T,
  name: string,
): CachedFunction<T> {
  const keyFor = (...args: Parameters<T>): string =>
    args.length === 0 ? name : `${name}:${JSON.stringify(args)}`;

  const cached = ((...args: Parameters<T>) => {
    const cacheKey = keyFor(...args);
    const entry = getOrCreateCacheEntry(cacheKey);
    entry.version[0]();
    if (entry.error !== undefined) {
      throw entry.error;
    }
    if (entry.hasValue) {
      return entry.value;
    }
    if (entry.inFlight) {
      return entry.inFlight;
    }
    let result: any;
    try {
      result = fn(...args);
    } catch (err) {
      entry.error = err;
      throw err;
    }
    if (result instanceof Promise) {
      const promise = result
        .then((resolved) => {
          entry.value = resolved;
          entry.hasValue = true;
          entry.inFlight = undefined;
          return resolved;
        })
        .catch((err) => {
          entry.error = err;
          entry.inFlight = undefined;
          throw err;
        });
      entry.inFlight = promise;
      return promise;
    }
    entry.value = result;
    entry.hasValue = true;
    return result;
  }) as CachedFunction<T>;

  cached.key = name;
  cached.keyFor = keyFor;
  return cached;
}

export function revalidate(
  key?: string | string[] | void,
  _force = true,
): Promise<void> {
  const keys = key === undefined ? undefined : Array.isArray(key) ? key : [key];
  batch(() => {
    for (const [cacheKey, entry] of queryCache.entries()) {
      const matches =
        !keys ||
        keys.some((k) => cacheKey === k || cacheKey.startsWith(`${k}:`));
      if (matches) {
        entry.hasValue = false;
        entry.value = undefined;
        entry.error = undefined;
        entry.inFlight = undefined;
        entry.version[1]((v) => v + 1);
      }
    }
  });
  return Promise.resolve();
}

export interface CreateAsyncOptions<T> {
  name?: string;
  initialValue?: T;
  deferStream?: boolean;
}

export type AccessorWithLatest<T> = Accessor<T> & {
  readonly latest: T;
};

export function createAsync<T>(
  fn: (prev: T) => Promise<T> | T,
  options: CreateAsyncOptions<T> & { initialValue: T },
): AccessorWithLatest<T>;
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T> | T,
  options?: CreateAsyncOptions<T>,
): AccessorWithLatest<T | undefined>;
export function createAsync<T>(
  fn: (prev: any) => Promise<T> | T,
  options?: CreateAsyncOptions<T>,
): AccessorWithLatest<T | undefined> {
  const [value, setValue] = createSignal<T | undefined>(options?.initialValue);
  const [error, setError] = createSignal<unknown>(undefined);
  let runId = 0;

  createComputed(() => {
    const currentId = ++runId;
    const prev = untrack(value);
    setError(undefined);
    let raw: Promise<T> | T;
    try {
      raw = fn(prev);
    } catch (err) {
      setError(() => err);
      return;
    }
    if (raw instanceof Promise) {
      raw.then(
        (resolved) => {
          if (currentId === runId) {
            setValue(() => resolved);
          }
        },
        (err) => {
          if (currentId === runId) {
            setError(() => err);
          }
        },
      );
    } else {
      setValue(() => raw);
    }
  });

  const accessor = (() => {
    const err = error();
    if (err !== undefined) throw err;
    return value();
  }) as AccessorWithLatest<T | undefined>;

  Object.defineProperty(accessor, "latest", {
    get() {
      const err = error();
      if (err !== undefined) throw err;
      return value();
    },
    enumerable: true,
    configurable: true,
  });

  return accessor;
}

export function createAsyncStore<T extends object>(
  fn: (prev: T | undefined) => Promise<T> | T,
  options?: CreateAsyncOptions<T> & {
    reconcile?: { key?: string | null; merge?: boolean };
  },
): AccessorWithLatest<T | undefined> {
  const [initialized, setInitialized] = createSignal(
    options?.initialValue !== undefined,
  );
  const [store, setStore] = createStore<any>(
    options?.initialValue ? { ...(options.initialValue as object) } : {},
  );
  const [error, setError] = createSignal<unknown>(undefined);
  let runId = 0;

  const applyValue = (next: T) => {
    batch(() => {
      if (next && typeof next === "object") {
        setStore(reconcile(next, options?.reconcile));
      }
      setInitialized(true);
    });
  };

  createComputed(() => {
    const currentId = ++runId;
    const prev = untrack(() => (initialized() ? (store as T) : undefined));
    setError(undefined);
    let raw: Promise<T> | T;
    try {
      raw = fn(prev);
    } catch (err) {
      setError(() => err);
      return;
    }
    if (raw instanceof Promise) {
      raw.then(
        (resolved) => {
          if (currentId === runId) {
            applyValue(resolved);
          }
        },
        (err) => {
          if (currentId === runId) {
            setError(() => err);
          }
        },
      );
    } else {
      applyValue(raw);
    }
  });

  const accessor = (() => {
    const err = error();
    if (err !== undefined) throw err;
    return initialized() ? (store as T) : undefined;
  }) as AccessorWithLatest<T | undefined>;

  Object.defineProperty(accessor, "latest", {
    get() {
      return accessor();
    },
    enumerable: true,
    configurable: true,
  });

  return accessor;
}

// ============================================================================
// Actions (`action`, `useAction`, `useSubmission`, `useSubmissions`)
// ============================================================================

export interface Submission<T extends Array<any>, U> {
  readonly input: T | undefined;
  readonly result: U | undefined;
  readonly error: any;
  readonly pending: boolean;
  readonly url: string;
  clear(): void;
  retry(): Promise<U>;
}

export interface Action<T extends Array<any>, U> {
  (...vars: T): Promise<U>;
  url: string;
  with<A extends any[]>(
    ...args: A
  ): Action<T extends [...A, ...infer Rest] ? Rest : any[], U>;
}

export interface ActionOptions {
  name?: string;
}

let actionAutoId = 0;
const actionSubmissions = new WeakMap<
  object,
  Accessor<Array<Submission<any, any>>>
>();

export function action<T extends Array<any>, U = void>(
  fn: (...args: T) => Promise<U> | U,
  options?: string | ActionOptions,
): Action<T, U> {
  const name =
    typeof options === "string"
      ? options
      : (options?.name ?? `action-${++actionAutoId}`);
  const url = `/_server/action/${encodeURIComponent(name)}`;
  const [submissions, setSubmissions] = createSignal<Array<Submission<T, U>>>(
    [],
  );

  const execute = (...vars: T): Promise<U> => {
    const [pending, setPending] = createSignal(true);
    const [result, setResult] = createSignal<U | undefined>(undefined);
    const [error, setError] = createSignal<any>(undefined);

    const clear = () => {
      setSubmissions((list) => list.filter((item) => item !== sub));
    };

    const runAttempt = async (): Promise<U> => {
      batch(() => {
        setPending(true);
        setError(undefined);
      });
      try {
        const res = await fn(...vars);
        if (res instanceof Response) {
          const revalidateHeader = res.headers.get("X-Revalidate");
          if (revalidateHeader) {
            await revalidate(revalidateHeader.split(",").filter(Boolean));
          }
          const locationHeader = res.headers.get("Location");
          if (locationHeader && activeRouterContext) {
            activeRouterContext.navigate(locationHeader);
          }
        }
        batch(() => {
          setResult(() => res);
          setPending(false);
        });
        return res;
      } catch (err) {
        batch(() => {
          setError(() => err);
          setPending(false);
        });
        throw err;
      }
    };

    const sub: Submission<T, U> = {
      input: vars,
      url,
      get result() {
        return result();
      },
      get error() {
        return error();
      },
      get pending() {
        return pending();
      },
      clear,
      retry: runAttempt,
    };

    setSubmissions((list) => [...list, sub]);
    return runAttempt();
  };

  const act = ((...vars: T) => execute(...vars)) as Action<T, U>;
  act.url = url;
  act.with = <A extends any[]>(...boundArgs: A) => {
    const bound = ((...rest: any[]) =>
      execute(...([...boundArgs, ...rest] as unknown as T))) as Action<any, U>;
    bound.url = url;
    bound.with = ((...more: any[]) => act.with(...boundArgs, ...more)) as any;
    actionSubmissions.set(bound, submissions);
    return bound;
  };

  actionSubmissions.set(act, submissions);
  return act;
}

export function useAction<T extends Array<any>, U>(
  act: Action<T, U>,
): (...vars: T) => Promise<U> {
  return (...vars: T) => act(...vars);
}

export function useSubmissions<T extends Array<any>, U>(
  act: Action<T, U>,
  filter?: (input: T) => boolean,
): Accessor<Array<Submission<T, U>>> {
  const subsAccessor = actionSubmissions.get(act);
  if (!subsAccessor) {
    throw new TypeError("useSubmissions requires a valid action()");
  }
  return createMemo(() => {
    const all = subsAccessor() as Array<Submission<T, U>>;
    if (!filter) return all;
    return all.filter((s) => s.input && filter(s.input));
  });
}

export function useSubmission<T extends Array<any>, U>(
  act: Action<T, U>,
  filter?: (input: T) => boolean,
): Submission<T, U> {
  const matching = useSubmissions(act, filter);
  const latest = createMemo(() => {
    const list = matching();
    return list[list.length - 1];
  });

  return {
    get input() {
      return latest()?.input;
    },
    get result() {
      return latest()?.result;
    },
    get error() {
      return latest()?.error;
    },
    get pending() {
      return latest()?.pending ?? false;
    },
    get url() {
      return act.url;
    },
    clear() {
      for (const sub of matching().slice()) {
        sub.clear();
      }
    },
    retry() {
      const current = latest();
      if (!current) {
        return Promise.reject(new Error("No submission to retry"));
      }
      return current.retry();
    },
  };
}

// ============================================================================
// Response Helpers (`redirect`, `reload`, `json`)
// ============================================================================

export function redirect(
  url: string,
  init: number | ResponseInit = 302,
): Response {
  const responseInit: ResponseInit =
    typeof init === "number" ? { status: init } : { status: 302, ...init };
  const headers = new Headers(responseInit.headers);
  headers.set("Location", url);
  return new Response(null, { ...responseInit, headers });
}

export interface ReloadOptions extends ResponseInit {
  revalidate?: string | string[] | boolean;
}

export function reload(options?: ReloadOptions): Response {
  const headers = new Headers(options?.headers);
  if (options?.revalidate !== undefined) {
    const val = Array.isArray(options.revalidate)
      ? options.revalidate.join(",")
      : String(options.revalidate);
    headers.set("X-Revalidate", val);
    headers.set("X-Single-Flight", val);
  }
  return new Response(null, {
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
  });
}

export function json<T>(data: T, init: number | ResponseInit = 200): Response {
  const responseInit: ResponseInit =
    typeof init === "number" ? { status: init } : { status: 200, ...init };
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers,
  });
}
