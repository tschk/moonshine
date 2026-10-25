/**
 * Host-free SvelteKit client/universal `$app/*` runtime on the Moonshine reactive graph.
 * Implements `$app/state` (`page`, `navigating`, `updated`), `$app/stores`
 * (`page`, `navigating`, `updated`, `getStores`), `$app/navigation` (`goto`,
 * `invalidate`, `invalidateAll`, `preloadData`, `preloadCode`, `beforeNavigate`,
 * `afterNavigate`, `onNavigate`, `pushState`, `replaceState`,
 * `disableScrollHandling`), `$app/paths` (`base`, `assets`, `resolveRoute`,
 * `asset`, `resolve`), `$app/environment` (`browser`, `dev`, `building`,
 * `version`), and `$app/forms` (`applyAction`, `deserialize`, `enhance`).
 */
import {
  batch,
  createSignal,
  getOwner,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import {
  writable,
  type Invalidator,
  type Readable,
  type Subscriber,
  type Unsubscriber,
} from "./store";

// ============================================================================
// `$app/environment`
// ============================================================================

export let browser: boolean =
  typeof window !== "undefined" && typeof document !== "undefined";
export let dev = false;
export let building = false;
export let version = "0.4.68";

export interface KitEnvironmentConfig {
  browser?: boolean;
  dev?: boolean;
  building?: boolean;
  version?: string;
}

export function configureKitEnvironment(config: KitEnvironmentConfig): void {
  if (config.browser !== undefined) browser = config.browser;
  if (config.dev !== undefined) dev = config.dev;
  if (config.building !== undefined) building = config.building;
  if (config.version !== undefined) version = config.version;
}

// ============================================================================
// `$app/paths`
// ============================================================================

export let base = "";
export let assets = "";

export interface KitPathsConfig {
  base?: string;
  assets?: string;
}

export function configureKitPaths(config: KitPathsConfig): void {
  if (config.base !== undefined) {
    base = config.base === "/" ? "" : config.base.replace(/\/+$/, "");
  }
  if (config.assets !== undefined) {
    assets = config.assets.replace(/\/+$/, "");
  }
}

export function resolveRoute(
  id: string,
  params: Record<string, string | undefined> = {},
): string {
  const segments = id.split("/");
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment) continue;
    // Skip route groups like `(app)` or `(marketing)`
    if (/^\([^)]+\)$/.test(segment)) continue;

    // Optional parameter `[[param]]`
    const optionalMatch = /^\[\[([A-Za-z0-9_]+)(?:=[A-Za-z0-9_]+)?\]\]$/.exec(
      segment,
    );
    if (optionalMatch) {
      const key = optionalMatch[1]!;
      const val = params[key];
      if (val !== undefined && val !== "") {
        resolved.push(encodeURIComponent(val));
      }
      continue;
    }

    // Rest parameter `[...rest]`
    const restMatch = /^\[\.\.\.([A-Za-z0-9_]+)(?:=[A-Za-z0-9_]+)?\]$/.exec(
      segment,
    );
    if (restMatch) {
      const key = restMatch[1]!;
      const val = params[key];
      if (val !== undefined && val !== "") {
        for (const part of val.split("/")) {
          resolved.push(encodeURIComponent(part));
        }
      }
      continue;
    }

    // Inline or full `[param]` segments
    let missingRequired = false;
    const replaced = segment.replace(
      /\[([A-Za-z0-9_]+)(?:=[A-Za-z0-9_]+)?\]/g,
      (_m, key: string) => {
        const val = params[key];
        if (val === undefined) {
          missingRequired = true;
          return "";
        }
        return encodeURIComponent(val);
      },
    );
    if (missingRequired) {
      throw new Error(
        `Missing required parameter for route "${id}" in segment "${segment}"`,
      );
    }
    resolved.push(replaced);
  }

  const path = "/" + resolved.join("/");
  return base ? `${base}${path === "/" ? "" : path}` || "/" : path;
}

export function asset(file: string): string {
  const prefix = assets || base;
  const clean = file.startsWith("/") ? file : `/${file}`;
  return `${prefix}${clean}`;
}

export function resolve(
  routeOrPath: string,
  params?: Record<string, string | undefined>,
): string {
  if (params || routeOrPath.includes("[") || routeOrPath.includes("(")) {
    return resolveRoute(routeOrPath, params ?? {});
  }
  const clean = routeOrPath.startsWith("/") ? routeOrPath : `/${routeOrPath}`;
  return base ? `${base}${clean === "/" ? "" : clean}` || "/" : clean;
}

// ============================================================================
// `$app/state` & `$app/stores` Types & Reactive State
// ============================================================================

export interface AppError {
  message: string;
  [key: string]: unknown;
}

export interface Page<
  Params extends Record<string, string> = Record<string, string>,
  OutputData extends Record<string, any> = Record<string, any>,
> {
  url: URL;
  params: Params;
  route: {
    id: string | null;
  };
  status: number;
  error: AppError | null;
  data: OutputData;
  state: Record<string, any>;
  form: any;
}

export interface NavigationTarget<
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
> {
  params: Params | null;
  route: { id: RouteId };
  url: URL;
}

export type NavigationType =
  "enter" | "form" | "leave" | "link" | "goto" | "popstate";

export interface Navigation {
  from: NavigationTarget | null;
  to: NavigationTarget | null;
  type: NavigationType;
  willUnload: boolean;
  delta?: number;
  complete: Promise<void>;
}

export interface BeforeNavigate extends Navigation {
  cancel(): void;
}

export interface AfterNavigate extends Navigation {
  type: Exclude<NavigationType, "leave">;
}

export interface OnNavigate extends Navigation {
  type: Exclude<NavigationType, "enter" | "leave">;
}

function toURL(raw: string | URL, baseHref = "http://localhost"): URL {
  if (raw instanceof URL) return new URL(raw.href);
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return new URL(raw);
  const origin =
    typeof window !== "undefined" &&
    window.location?.origin &&
    window.location.origin !== "null"
      ? window.location.origin
      : baseHref;
  return new URL(raw.startsWith("/") ? raw : `/${raw}`, origin);
}

function createInitialPage(urlInput: string | URL = "http://localhost/"): Page {
  return {
    url: toURL(urlInput),
    params: {},
    route: { id: "/" },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  };
}

const initialPageSnapshot = createInitialPage();

const [urlSignal, setUrlSignal] = createSignal<URL>(initialPageSnapshot.url);
const [paramsSignal, setParamsSignal] = createSignal<Record<string, string>>(
  initialPageSnapshot.params,
);
const [routeSignal, setRouteSignal] = createSignal<{ id: string | null }>(
  initialPageSnapshot.route,
);
const [statusSignal, setStatusSignal] = createSignal<number>(
  initialPageSnapshot.status,
);
const [errorSignal, setErrorSignal] = createSignal<AppError | null>(
  initialPageSnapshot.error,
);
const [dataSignal, setDataSignal] = createSignal<Record<string, any>>(
  initialPageSnapshot.data,
);
const [stateSignal, setStateSignal] = createSignal<Record<string, any>>(
  initialPageSnapshot.state,
);
const [formSignal, setFormSignal] = createSignal<any>(initialPageSnapshot.form);

const pageStore = writable<Page>(initialPageSnapshot);

function buildPageSnapshot(): Page {
  return {
    url: urlSignal(),
    params: paramsSignal(),
    route: routeSignal(),
    status: statusSignal(),
    error: errorSignal(),
    data: dataSignal(),
    state: stateSignal(),
    form: formSignal(),
  };
}

export interface PageStateInput {
  url?: string | URL;
  params?: Record<string, string>;
  route?: { id: string | null } | string | null;
  status?: number;
  error?: AppError | string | null;
  data?: Record<string, any>;
  state?: Record<string, any>;
  form?: any;
}

export function setKitPage(patch: PageStateInput): Page {
  let snapshot!: Page;
  batch(() => {
    if (patch.url !== undefined) {
      setUrlSignal(toURL(patch.url, untrack(urlSignal).origin));
    }
    if (patch.params !== undefined) {
      setParamsSignal({ ...patch.params });
    }
    if (patch.route !== undefined) {
      setRouteSignal(
        typeof patch.route === "string" || patch.route === null
          ? { id: patch.route }
          : { id: patch.route.id },
      );
    }
    if (patch.status !== undefined) {
      setStatusSignal(patch.status);
    }
    if (patch.error !== undefined) {
      setErrorSignal(
        typeof patch.error === "string"
          ? { message: patch.error }
          : patch.error,
      );
    }
    if (patch.data !== undefined) {
      setDataSignal({ ...patch.data });
    }
    if (patch.state !== undefined) {
      setStateSignal({ ...patch.state });
    }
    if (patch.form !== undefined) {
      setFormSignal(patch.form);
    }
    snapshot = untrack(buildPageSnapshot);
    pageStore.set(snapshot);
  });
  return snapshot;
}

export const page: Page & Readable<Page> = {
  get url() {
    return urlSignal();
  },
  get params() {
    return paramsSignal();
  },
  get route() {
    return routeSignal();
  },
  get status() {
    return statusSignal();
  },
  get error() {
    return errorSignal();
  },
  get data() {
    return dataSignal();
  },
  get state() {
    return stateSignal();
  },
  get form() {
    return formSignal();
  },
  subscribe(
    run: Subscriber<Page>,
    invalidate?: Invalidator<Page>,
  ): Unsubscriber {
    return pageStore.subscribe(run, invalidate);
  },
};

const [navigatingSignal, setNavigatingSignal] = createSignal<Navigation | null>(
  null,
);
const navigatingStore = writable<Navigation | null>(null);

function updateNavigating(next: Navigation | null): void {
  batch(() => {
    setNavigatingSignal(next);
    navigatingStore.set(next);
  });
}

export interface NavigatingState extends Readable<Navigation | null> {
  readonly from: NavigationTarget | null;
  readonly to: NavigationTarget | null;
  readonly type: NavigationType | null;
  readonly willUnload: boolean | null;
  readonly delta: number | undefined;
  readonly complete: Promise<void> | null;
  readonly current: Navigation | null;
}

export const navigating: NavigatingState = {
  get from() {
    return navigatingSignal()?.from ?? null;
  },
  get to() {
    return navigatingSignal()?.to ?? null;
  },
  get type() {
    return navigatingSignal()?.type ?? null;
  },
  get willUnload() {
    return navigatingSignal()?.willUnload ?? null;
  },
  get delta() {
    return navigatingSignal()?.delta;
  },
  get complete() {
    return navigatingSignal()?.complete ?? null;
  },
  get current() {
    return navigatingSignal();
  },
  subscribe(
    run: Subscriber<Navigation | null>,
    invalidate?: Invalidator<Navigation | null>,
  ): Unsubscriber {
    return navigatingStore.subscribe(run, invalidate);
  },
};

const [updatedSignal, setUpdatedSignal] = createSignal<boolean>(false);
const updatedStore = writable<boolean>(false);
let versionCheckHandler: (() => Promise<boolean> | boolean) | undefined;

export function setKitVersionChecker(
  checker: (() => Promise<boolean> | boolean) | undefined,
): void {
  versionCheckHandler = checker;
}

export function setKitUpdated(value: boolean): void {
  batch(() => {
    setUpdatedSignal(value);
    updatedStore.set(value);
  });
}

export interface UpdatedState extends Readable<boolean> {
  readonly current: boolean;
  check(): Promise<boolean>;
}

export const updated: UpdatedState = {
  get current() {
    return updatedSignal();
  },
  async check(): Promise<boolean> {
    if (versionCheckHandler) {
      const changed = Boolean(await versionCheckHandler());
      if (changed) setKitUpdated(true);
      return changed;
    }
    return untrack(updatedSignal);
  },
  subscribe(
    run: Subscriber<boolean>,
    invalidate?: Invalidator<boolean>,
  ): Unsubscriber {
    return updatedStore.subscribe(run, invalidate);
  },
};

export function getStores(): {
  page: Readable<Page>;
  navigating: Readable<Navigation | null>;
  updated: UpdatedState;
} {
  return { page, navigating, updated };
}

// ============================================================================
// Route Table & Load Invalidation Support
// ============================================================================

export interface KitLoadEvent<
  Params extends Record<string, string> = Record<string, string>,
> {
  url: URL;
  params: Params;
  route: { id: string | null };
  fetch: typeof globalThis.fetch;
  depends: (...deps: string[]) => void;
  parent: () => Promise<Record<string, any>>;
  untrack: <T>(fn: () => T) => T;
  data?: Record<string, any>;
}

export interface KitRouteDefinition<
  Params extends Record<string, string> = Record<string, string>,
> {
  id: string;
  load?: (
    event: KitLoadEvent<Params>,
  ) => Promise<Record<string, any> | void> | Record<string, any> | void;
}

interface CompiledKitRoute {
  id: string;
  regex: RegExp;
  keys: Array<{ name: string; optional: boolean; rest: boolean }>;
  load?: KitRouteDefinition["load"];
}

let registeredRoutes: CompiledKitRoute[] = [];
const activeLoadDependencies = new Set<string>();
let scrollHandlingDisabled = false;

function compileKitRoute(def: KitRouteDefinition): CompiledKitRoute {
  const rawSegments = def.id.split("/").filter(Boolean);
  const keys: Array<{ name: string; optional: boolean; rest: boolean }> = [];
  let pattern = "^";

  for (const seg of rawSegments) {
    if (/^\([^)]+\)$/.test(seg)) continue;

    const optionalMatch = /^\[\[([A-Za-z0-9_]+)(?:=[A-Za-z0-9_]+)?\]\]$/.exec(
      seg,
    );
    if (optionalMatch) {
      keys.push({ name: optionalMatch[1]!, optional: true, rest: false });
      pattern += "(?:/([^/]+))?";
      continue;
    }

    const restMatch = /^\[\.\.\.([A-Za-z0-9_]+)(?:=[A-Za-z0-9_]+)?\]$/.exec(
      seg,
    );
    if (restMatch) {
      keys.push({ name: restMatch[1]!, optional: true, rest: true });
      pattern += "(?:/(.*))?";
      continue;
    }

    const paramMatch = /^\[([A-Za-z0-9_]+)(?:=[A-Za-z0-9_]+)?\]$/.exec(seg);
    if (paramMatch) {
      keys.push({ name: paramMatch[1]!, optional: false, rest: false });
      pattern += "/([^/]+)";
      continue;
    }

    const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern += `/${escaped}`;
  }

  if (pattern === "^") {
    pattern = "^/?$";
  } else {
    pattern += "/?$";
  }

  return {
    id: def.id,
    regex: new RegExp(pattern),
    keys,
    load: def.load,
  };
}

export function registerKitRoutes(routes: KitRouteDefinition[]): void {
  registeredRoutes = routes.map(compileKitRoute);
}

function matchKitRoute(pathname: string): {
  routeId: string | null;
  params: Record<string, string>;
  route?: CompiledKitRoute;
} {
  const stripped =
    base && pathname.startsWith(base)
      ? pathname.slice(base.length) || "/"
      : pathname || "/";

  for (const r of registeredRoutes) {
    const m = r.regex.exec(stripped);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, idx) => {
        const val = m[idx + 1];
        if (val !== undefined) {
          params[k.name] = k.rest
            ? val
                .split("/")
                .map((part) => decodeURIComponent(part))
                .join("/")
            : decodeURIComponent(val);
        } else if (k.rest) {
          params[k.name] = "";
        }
      });
      return { routeId: r.id, params, route: r };
    }
  }

  return { routeId: stripped, params: {} };
}

async function executeRouteLoad(
  route: CompiledKitRoute | undefined,
  targetUrl: URL,
  params: Record<string, string>,
): Promise<Record<string, any> | undefined> {
  if (!route?.load) return undefined;
  activeLoadDependencies.clear();
  const res = await route.load({
    url: targetUrl,
    params,
    route: { id: route.id },
    fetch: globalThis.fetch.bind(globalThis),
    depends: (...deps: string[]) => {
      for (const dep of deps) {
        activeLoadDependencies.add(dep);
      }
    },
    parent: async () => ({}),
    untrack,
  });
  return res ? { ...res } : {};
}

// ============================================================================
// `$app/navigation` Hooks & Functions
// ============================================================================

const beforeNavigateCallbacks = new Set<(navigation: BeforeNavigate) => void>();
const afterNavigateCallbacks = new Set<(navigation: AfterNavigate) => void>();
const onNavigateCallbacks = new Set<
  (navigation: OnNavigate) => Promise<(() => void) | void> | (() => void) | void
>();

export function beforeNavigate(
  callback: (navigation: BeforeNavigate) => void,
): void {
  beforeNavigateCallbacks.add(callback);
  if (getOwner()) {
    onCleanup(() => {
      beforeNavigateCallbacks.delete(callback);
    });
  }
}

export function afterNavigate(
  callback: (navigation: AfterNavigate) => void,
): void {
  afterNavigateCallbacks.add(callback);
  if (getOwner()) {
    onCleanup(() => {
      afterNavigateCallbacks.delete(callback);
    });
  }
}

export function onNavigate(
  callback: (
    navigation: OnNavigate,
  ) => Promise<(() => void) | void> | (() => void) | void,
): void {
  onNavigateCallbacks.add(callback);
  if (getOwner()) {
    onCleanup(() => {
      onNavigateCallbacks.delete(callback);
    });
  }
}

export function disableScrollHandling(): void {
  scrollHandlingDisabled = true;
}

export function isScrollHandlingDisabled(): boolean {
  return scrollHandlingDisabled;
}

export interface GotoOptions {
  replaceState?: boolean;
  noScroll?: boolean;
  keepFocus?: boolean;
  invalidateAll?: boolean;
  invalidate?: Array<string | URL | ((url: URL) => boolean)>;
  state?: Record<string, any>;
}

export async function goto(
  url: string | URL,
  opts: GotoOptions = {},
): Promise<void> {
  const currentSnapshot = untrack(buildPageSnapshot);
  const targetUrl = toURL(url, currentSnapshot.url.origin);
  const matched = matchKitRoute(targetUrl.pathname);

  const fromTarget: NavigationTarget = {
    params: { ...currentSnapshot.params },
    route: { id: currentSnapshot.route.id },
    url: new URL(currentSnapshot.url.href),
  };
  const toTarget: NavigationTarget = {
    params: { ...matched.params },
    route: { id: matched.routeId },
    url: targetUrl,
  };

  let resolveComplete!: () => void;
  const completePromise = new Promise<void>((res) => {
    resolveComplete = res;
  });

  let cancelled = false;
  const beforeNav: BeforeNavigate = {
    from: fromTarget,
    to: toTarget,
    type: "goto",
    willUnload: targetUrl.origin !== currentSnapshot.url.origin,
    complete: completePromise,
    cancel() {
      cancelled = true;
    },
  };

  for (const cb of Array.from(beforeNavigateCallbacks)) {
    cb(beforeNav);
  }
  if (cancelled) {
    return;
  }

  scrollHandlingDisabled = false;
  const navObject: Navigation = {
    from: fromTarget,
    to: toTarget,
    type: "goto",
    willUnload: false,
    complete: completePromise,
  };
  updateNavigating(navObject);

  const onNavCleanups: Array<() => void> = [];
  for (const cb of Array.from(onNavigateCallbacks)) {
    const ret = await cb(navObject as OnNavigate);
    if (typeof ret === "function") {
      onNavCleanups.push(ret);
    }
  }

  const loadedData = await executeRouteLoad(
    matched.route,
    targetUrl,
    matched.params,
  );

  if (typeof window !== "undefined" && window.history) {
    const historyHref = targetUrl.pathname + targetUrl.search + targetUrl.hash;
    try {
      if (opts.replaceState) {
        window.history.replaceState(opts.state ?? {}, "", historyHref);
      } else {
        window.history.pushState(opts.state ?? {}, "", historyHref);
      }
    } catch {
      // Ignore cross-origin history errors in synthetic environments
    }
  }

  setKitPage({
    url: targetUrl,
    params: matched.params,
    route: { id: matched.routeId },
    status: 200,
    error: null,
    data: loadedData ?? currentSnapshot.data,
    state: opts.state ?? {},
  });

  if (opts.invalidate) {
    for (const inv of opts.invalidate) {
      await invalidate(inv);
    }
  } else if (opts.invalidateAll) {
    await invalidateAll();
  }

  updateNavigating(null);
  resolveComplete();

  for (const cleanup of onNavCleanups) {
    cleanup();
  }

  const afterNav: AfterNavigate = {
    from: fromTarget,
    to: toTarget,
    type: "goto",
    willUnload: false,
    complete: completePromise,
  };
  for (const cb of Array.from(afterNavigateCallbacks)) {
    cb(afterNav);
  }
}

export async function invalidate(
  resource: string | URL | ((url: URL) => boolean),
): Promise<void> {
  const currentSnapshot = untrack(buildPageSnapshot);
  let shouldRerun = false;

  if (typeof resource === "function") {
    for (const dep of activeLoadDependencies) {
      try {
        if (resource(toURL(dep, currentSnapshot.url.origin))) {
          shouldRerun = true;
          break;
        }
      } catch {
        // Ignore non-URL custom dependency strings for URL predicate
      }
    }
    if (!shouldRerun && resource(currentSnapshot.url)) {
      shouldRerun = true;
    }
  } else {
    const key = typeof resource === "string" ? resource : resource.href;
    if (
      activeLoadDependencies.has(key) ||
      (typeof resource === "string" &&
        activeLoadDependencies.has(
          toURL(resource, currentSnapshot.url.origin).href,
        )) ||
      activeLoadDependencies.size === 0
    ) {
      shouldRerun = true;
    }
  }

  if (shouldRerun) {
    await invalidateAll();
  }
}

export async function invalidateAll(): Promise<void> {
  const currentSnapshot = untrack(buildPageSnapshot);
  const matched = matchKitRoute(currentSnapshot.url.pathname);
  const loadedData = await executeRouteLoad(
    matched.route,
    currentSnapshot.url,
    matched.params,
  );
  if (loadedData !== undefined) {
    setKitPage({ data: loadedData });
  }
}

export async function preloadData(
  href: string,
): Promise<
  | { type: "loaded"; status: number; data: Record<string, any> }
  | { type: "redirect"; location: string }
> {
  const currentSnapshot = untrack(buildPageSnapshot);
  const targetUrl = toURL(href, currentSnapshot.url.origin);
  const matched = matchKitRoute(targetUrl.pathname);
  const data =
    (await executeRouteLoad(matched.route, targetUrl, matched.params)) ?? {};
  return {
    type: "loaded",
    status: 200,
    data,
  };
}

const preloadedCodeUrls = new Set<string>();

export async function preloadCode(...urls: string[]): Promise<void> {
  for (const u of urls) {
    preloadedCodeUrls.add(u);
  }
}

export function getPreloadedCodeUrls(): ReadonlySet<string> {
  return preloadedCodeUrls;
}

export function pushState(url: string | URL, state: Record<string, any>): void {
  const currentSnapshot = untrack(buildPageSnapshot);
  const nextUrl =
    url === "" ? currentSnapshot.url : toURL(url, currentSnapshot.url.origin);
  if (typeof window !== "undefined" && window.history?.pushState) {
    try {
      window.history.pushState(
        state,
        "",
        nextUrl.pathname + nextUrl.search + nextUrl.hash,
      );
    } catch {
      // Ignore in non-browser origins
    }
  }
  setKitPage({ url: nextUrl, state });
}

export function replaceState(
  url: string | URL,
  state: Record<string, any>,
): void {
  const currentSnapshot = untrack(buildPageSnapshot);
  const nextUrl =
    url === "" ? currentSnapshot.url : toURL(url, currentSnapshot.url.origin);
  if (typeof window !== "undefined" && window.history?.replaceState) {
    try {
      window.history.replaceState(
        state,
        "",
        nextUrl.pathname + nextUrl.search + nextUrl.hash,
      );
    } catch {
      // Ignore in non-browser origins
    }
  }
  setKitPage({ url: nextUrl, state });
}

export function resetKitNavigation(
  initialUrl: string | URL = "http://localhost/",
): void {
  beforeNavigateCallbacks.clear();
  afterNavigateCallbacks.clear();
  onNavigateCallbacks.clear();
  activeLoadDependencies.clear();
  preloadedCodeUrls.clear();
  registeredRoutes = [];
  scrollHandlingDisabled = false;
  updateNavigating(null);
  setKitUpdated(false);
  const fresh = createInitialPage(initialUrl);
  setKitPage(fresh);
}

// ============================================================================
// `$app/forms` (`applyAction`, `deserialize`, `enhance`)
// ============================================================================

export type ActionResult<
  Success extends Record<string, unknown> | undefined = Record<string, any>,
  Failure extends Record<string, unknown> | undefined = Record<string, any>,
> =
  | { type: "success"; status: number; data?: Success }
  | { type: "failure"; status: number; data?: Failure }
  | { type: "redirect"; status: number; location: string }
  | { type: "error"; status?: number; error: any };

export function deserialize<
  Success extends Record<string, unknown> | undefined = Record<string, any>,
  Failure extends Record<string, unknown> | undefined = Record<string, any>,
>(result: string): ActionResult<Success, Failure> {
  const parsed = JSON.parse(result);
  if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
    return parsed as ActionResult<Success, Failure>;
  }
  return {
    type: "success",
    status: 200,
    data: parsed,
  };
}

export async function applyAction<
  Success extends Record<string, unknown> | undefined = Record<string, any>,
  Failure extends Record<string, unknown> | undefined = Record<string, any>,
>(result: ActionResult<Success, Failure>): Promise<void> {
  switch (result.type) {
    case "success": {
      setKitPage({
        status: result.status,
        form: result.data ?? null,
        error: null,
      });
      break;
    }
    case "failure": {
      setKitPage({
        status: result.status,
        form: result.data ?? null,
      });
      break;
    }
    case "redirect": {
      await goto(result.location, { invalidateAll: true });
      break;
    }
    case "error": {
      setKitPage({
        status: result.status ?? 500,
        error:
          typeof result.error === "string"
            ? { message: result.error }
            : (result.error ?? { message: "Action Error" }),
      });
      break;
    }
  }
}

export interface SubmitFunctionInput<
  _Success extends Record<string, unknown> | undefined = Record<string, any>,
  _Failure extends Record<string, unknown> | undefined = Record<string, any>,
> {
  action: URL;
  formData: FormData;
  formElement: HTMLFormElement;
  controller: AbortController;
  submitter: HTMLElement | null;
  cancel(): void;
}

export interface SubmitFunctionCallbackInput<
  Success extends Record<string, unknown> | undefined = Record<string, any>,
  Failure extends Record<string, unknown> | undefined = Record<string, any>,
> {
  formData: FormData;
  formElement: HTMLFormElement;
  action: URL;
  result: ActionResult<Success, Failure>;
  update(options?: { reset?: boolean; invalidateAll?: boolean }): Promise<void>;
}

export type SubmitFunction<
  Success extends Record<string, unknown> | undefined = Record<string, any>,
  Failure extends Record<string, unknown> | undefined = Record<string, any>,
> = (
  input: SubmitFunctionInput<Success, Failure>,
) =>
  | Promise<
      | ((
          input: SubmitFunctionCallbackInput<Success, Failure>,
        ) => Promise<void> | void)
      | void
    >
  | ((
      input: SubmitFunctionCallbackInput<Success, Failure>,
    ) => Promise<void> | void)
  | void;

export function enhance<
  Success extends Record<string, unknown> | undefined = Record<string, any>,
  Failure extends Record<string, unknown> | undefined = Record<string, any>,
>(
  formElement: HTMLFormElement,
  submit: SubmitFunction<Success, Failure> = () => {},
): { destroy(): void } {
  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    const currentSnapshot = untrack(buildPageSnapshot);
    const submitter =
      ((event as SubmitEvent).submitter as HTMLElement | null) ?? null;
    const rawAction =
      submitter?.getAttribute("formaction") ||
      formElement.getAttribute("action") ||
      currentSnapshot.url.href;
    const actionUrl = toURL(rawAction, currentSnapshot.url.origin);
    const formData = new FormData(formElement);
    if (
      submitter &&
      "name" in submitter &&
      typeof (submitter as HTMLButtonElement).name === "string" &&
      (submitter as HTMLButtonElement).name
    ) {
      formData.append(
        (submitter as HTMLButtonElement).name,
        (submitter as HTMLButtonElement).value ?? "",
      );
    }

    const controller = new AbortController();
    let cancelled = false;
    const callback = await submit({
      action: actionUrl,
      formData,
      formElement,
      controller,
      submitter,
      cancel() {
        cancelled = true;
      },
    });
    if (cancelled) return;

    let result: ActionResult<Success, Failure>;
    try {
      const response = await globalThis.fetch(actionUrl.href, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "x-sveltekit-action": "true",
        },
        body: formData,
        signal: controller.signal,
      });
      const text = await response.text();
      result = deserialize<Success, Failure>(text);
    } catch (error) {
      result = {
        type: "error",
        status: 500,
        error,
      };
    }

    const update = async (options?: {
      reset?: boolean;
      invalidateAll?: boolean;
    }) => {
      if (
        options?.reset !== false &&
        (result.type === "success" || result.type === "redirect") &&
        typeof formElement.reset === "function"
      ) {
        formElement.reset();
      }
      await applyAction(result);
      if (options?.invalidateAll !== false && result.type === "success") {
        await invalidateAll();
      }
    };

    if (typeof callback === "function") {
      await callback({
        formData,
        formElement,
        action: actionUrl,
        result,
        update,
      });
    } else {
      await update();
    }
  };

  const listener = ((event: Event) =>
    handleSubmit(event)) as unknown as EventListener;
  formElement.addEventListener("submit", listener);
  return {
    destroy() {
      formElement.removeEventListener("submit", listener);
    },
  };
}
