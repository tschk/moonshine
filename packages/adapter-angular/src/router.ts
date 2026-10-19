/**
 * Host-free Angular Router (`Router`, `ActivatedRoute`, `ActivatedRouteSnapshot`,
 * `RouterStateSnapshot`, `UrlTree`, `UrlSegment`, `DefaultUrlSerializer`,
 * `RedirectCommand`, functional guards/resolvers, and `provideRouter`)
 * backed by the Moonshine signal graph and DI system.
 */
import { batch, untrack } from "@tschk/moonshine";
import {
  getCurrentInjector,
  inject,
  InjectionToken,
  type EnvironmentProviders,
  type Injector,
  type InteropObservable,
  makeEnvironmentProviders,
  type Observer,
  type Provider,
  runInInjectionContext,
  signal,
  type Signal,
  type Subscribable,
  type Type,
  type Unsubscribable,
  type WritableSignal,
} from "./signals";

const ObservableSymbol: symbol =
  (typeof Symbol === "function" &&
    (Symbol as { observable?: symbol }).observable) ||
  Symbol.for("observable");

export const PRIMARY_OUTLET = "primary";

export type Params = {
  [key: string]: any;
};

export type Data = {
  [key: string | symbol]: any;
};

export interface ParamMap {
  has(name: string): boolean;
  get(name: string): string | null;
  getAll(name: string): string[];
  readonly keys: string[];
}

class ParamsAsMap implements ParamMap {
  readonly #params: Params;

  constructor(params: Params = {}) {
    this.#params = params ?? {};
  }

  has(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.#params, name);
  }

  get(name: string): string | null {
    if (this.has(name)) {
      const v = this.#params[name];
      if (Array.isArray(v)) {
        return v.length > 0 ? String(v[0]) : null;
      }
      return v != null ? String(v) : null;
    }
    return null;
  }

  getAll(name: string): string[] {
    if (this.has(name)) {
      const v = this.#params[name];
      if (Array.isArray(v)) {
        return v.map((item) => String(item));
      }
      return v != null ? [String(v)] : [];
    }
    return [];
  }

  get keys(): string[] {
    return Object.keys(this.#params);
  }
}

export function convertToParamMap(params: Params): ParamMap {
  return new ParamsAsMap(params);
}

/**
 * Single URL path segment with optional matrix parameters.
 */
export class UrlSegment {
  readonly #paramMap: ParamMap;

  constructor(
    public path: string,
    public parameters: { [name: string]: string } = {},
  ) {
    this.#paramMap = convertToParamMap(parameters);
  }

  get parameterMap(): ParamMap {
    return this.#paramMap;
  }

  toString(): string {
    const paramParts = Object.entries(this.parameters).map(
      ([k, v]) => `;${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
    );
    return `${encodeURIComponent(this.path)}${paramParts.join("")}`;
  }
}

/**
 * Tree node of URL segments and named outlet children.
 */
export class UrlSegmentGroup {
  parent: UrlSegmentGroup | null = null;

  constructor(
    public segments: UrlSegment[] = [],
    public children: { [key: string]: UrlSegmentGroup } = {},
  ) {
    for (const child of Object.values(children)) {
      child.parent = this;
    }
  }

  hasChildren(): boolean {
    return this.numberOfChildren > 0;
  }

  get numberOfChildren(): number {
    return Object.keys(this.children).length;
  }

  toString(): string {
    return serializeSegmentGroup(this, true);
  }
}

function serializeSegmentGroup(
  group: UrlSegmentGroup,
  isRoot: boolean,
): string {
  const path = group.segments.map((s) => s.toString()).join("/");
  const primary = group.children[PRIMARY_OUTLET];
  const primaryStr = primary ? serializeSegmentGroup(primary, false) : "";
  const auxNames = Object.keys(group.children).filter(
    (k) => k !== PRIMARY_OUTLET,
  );
  const auxStr =
    auxNames.length > 0
      ? `(${auxNames
          .map(
            (k) => `${k}:${serializeSegmentGroup(group.children[k]!, false)}`,
          )
          .join("//")})`
      : "";
  if (isRoot) {
    const joined = [path, primaryStr].filter(Boolean).join("/");
    return `${joined}${auxStr}`;
  }
  const joined = [path, primaryStr].filter(Boolean).join("/");
  return `${joined}${auxStr}`;
}

/**
 * Parsed URL representation containing segment groups, query parameters, and fragment.
 */
export class UrlTree {
  constructor(
    public root: UrlSegmentGroup = new UrlSegmentGroup(),
    public queryParams: Params = {},
    public fragment: string | null = null,
  ) {}

  get queryParamMap(): ParamMap {
    return convertToParamMap(this.queryParams);
  }

  toString(): string {
    return DEFAULT_SERIALIZER.serialize(this);
  }
}

export abstract class UrlSerializer {
  abstract parse(url: string): UrlTree;
  abstract serialize(tree: UrlTree): string;
}

export class DefaultUrlSerializer implements UrlSerializer {
  parse(url: string): UrlTree {
    let working = url.trim() || "/";
    let fragment: string | null = null;
    const hashIdx = working.indexOf("#");
    if (hashIdx !== -1) {
      fragment = decodeURIComponent(working.slice(hashIdx + 1));
      working = working.slice(0, hashIdx);
    }

    const queryParams: Params = {};
    const qIdx = working.indexOf("?");
    if (qIdx !== -1) {
      const queryStr = working.slice(qIdx + 1);
      working = working.slice(0, qIdx);
      for (const pair of queryStr.split("&")) {
        if (!pair) continue;
        const eqIdx = pair.indexOf("=");
        const rawKey = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
        const rawVal = eqIdx === -1 ? "" : pair.slice(eqIdx + 1);
        const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
        const val = decodeURIComponent(rawVal.replace(/\+/g, " "));
        if (Object.prototype.hasOwnProperty.call(queryParams, key)) {
          const existing = queryParams[key];
          if (Array.isArray(existing)) {
            existing.push(val);
          } else {
            queryParams[key] = [existing, val];
          }
        } else {
          queryParams[key] = val;
        }
      }
    }

    const cleanPath = working.replace(/^\/+|\/+$/g, "");
    const rawSegments = cleanPath ? cleanPath.split("/") : [];
    const segments: UrlSegment[] = rawSegments.map((rawSeg) => {
      const parts = rawSeg.split(";");
      const segPath = decodeURIComponent(parts[0] ?? "");
      const parameters: Record<string, string> = {};
      for (let i = 1; i < parts.length; i++) {
        const paramPart = parts[i]!;
        const eqIdx = paramPart.indexOf("=");
        if (eqIdx === -1) {
          parameters[decodeURIComponent(paramPart)] = "";
        } else {
          parameters[decodeURIComponent(paramPart.slice(0, eqIdx))] =
            decodeURIComponent(paramPart.slice(eqIdx + 1));
        }
      }
      return new UrlSegment(segPath, parameters);
    });

    const root =
      segments.length > 0
        ? new UrlSegmentGroup([], {
            [PRIMARY_OUTLET]: new UrlSegmentGroup(segments),
          })
        : new UrlSegmentGroup();

    return new UrlTree(root, queryParams, fragment);
  }

  serialize(tree: UrlTree): string {
    const segmentStr = serializeSegmentGroup(tree.root, true);
    const path = segmentStr.startsWith("/") ? segmentStr : `/${segmentStr}`;
    const queryEntries: string[] = [];
    for (const [k, v] of Object.entries(tree.queryParams ?? {})) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item !== undefined && item !== null) {
            queryEntries.push(
              `${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`,
            );
          }
        }
      } else {
        queryEntries.push(
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        );
      }
    }
    const query = queryEntries.length > 0 ? `?${queryEntries.join("&")}` : "";
    const hash =
      tree.fragment !== null && tree.fragment !== undefined
        ? `#${encodeURIComponent(tree.fragment)}`
        : "";
    return `${path}${query}${hash}`;
  }
}

const DEFAULT_SERIALIZER = new DefaultUrlSerializer();

export enum EventType {
  NavigationStart = 0,
  NavigationEnd = 1,
  NavigationCancel = 2,
  NavigationError = 3,
  RoutesRecognized = 4,
  ResolveStart = 5,
  ResolveEnd = 6,
  GuardsCheckStart = 7,
  GuardsCheckEnd = 8,
  ChildActivationStart = 11,
  ChildActivationEnd = 12,
  ActivationStart = 13,
  ActivationEnd = 14,
  Scroll = 15,
  NavigationSkipped = 16,
}

export class RouterEvent {
  constructor(
    public id: number,
    public url: string,
  ) {}
}

export class NavigationStart extends RouterEvent {
  readonly type = EventType.NavigationStart;
  constructor(
    id: number,
    url: string,
    public navigationTrigger:
      "imperative" | "popstate" | "hashchange" = "imperative",
    public restoredState: {
      [k: string]: any;
      navigationId: number;
    } | null = null,
  ) {
    super(id, url);
  }
}

export class NavigationEnd extends RouterEvent {
  readonly type = EventType.NavigationEnd;
  constructor(
    id: number,
    url: string,
    public urlAfterRedirects: string,
  ) {
    super(id, url);
  }
}

export class NavigationCancel extends RouterEvent {
  readonly type = EventType.NavigationCancel;
  constructor(
    id: number,
    url: string,
    public reason: string,
  ) {
    super(id, url);
  }
}

export class NavigationError extends RouterEvent {
  readonly type = EventType.NavigationError;
  constructor(
    id: number,
    url: string,
    public error: any,
    public target?: RouterStateSnapshot,
  ) {
    super(id, url);
  }
}

export class RoutesRecognized extends RouterEvent {
  readonly type = EventType.RoutesRecognized;
  constructor(
    id: number,
    url: string,
    public urlAfterRedirects: string,
    public state: RouterStateSnapshot,
  ) {
    super(id, url);
  }
}

export class GuardsCheckStart extends RouterEvent {
  readonly type = EventType.GuardsCheckStart;
  constructor(
    id: number,
    url: string,
    public urlAfterRedirects: string,
    public state: RouterStateSnapshot,
  ) {
    super(id, url);
  }
}

export class GuardsCheckEnd extends RouterEvent {
  readonly type = EventType.GuardsCheckEnd;
  constructor(
    id: number,
    url: string,
    public urlAfterRedirects: string,
    public state: RouterStateSnapshot,
    public shouldActivate: boolean,
  ) {
    super(id, url);
  }
}

export class ResolveStart extends RouterEvent {
  readonly type = EventType.ResolveStart;
  constructor(
    id: number,
    url: string,
    public urlAfterRedirects: string,
    public state: RouterStateSnapshot,
  ) {
    super(id, url);
  }
}

export class ResolveEnd extends RouterEvent {
  readonly type = EventType.ResolveEnd;
  constructor(
    id: number,
    url: string,
    public urlAfterRedirects: string,
    public state: RouterStateSnapshot,
  ) {
    super(id, url);
  }
}

export interface NavigationBehaviorOptions {
  skipLocationChange?: boolean;
  replaceUrl?: boolean;
  state?: { [k: string]: any };
  info?: unknown;
}

export interface UrlCreationOptions {
  relativeTo?: ActivatedRoute | null;
  queryParams?: Params | null;
  fragment?: string;
  queryParamsHandling?: "merge" | "preserve" | "";
  preserveFragment?: boolean;
}

export interface NavigationExtras
  extends UrlCreationOptions, NavigationBehaviorOptions {}

/**
 * Returned from a guard or resolver to redirect navigation with explicit behavior options.
 */
export class RedirectCommand {
  constructor(
    public readonly redirectTo: UrlTree,
    public readonly navigationBehaviorOptions?: NavigationBehaviorOptions,
  ) {}
}

export type GuardResult = boolean | UrlTree | RedirectCommand;
export type MaybeAsync<T> = T | Promise<T> | Subscribable<T>;

export type CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => MaybeAsync<GuardResult>;

export type CanActivateChildFn = (
  childRoute: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => MaybeAsync<GuardResult>;

export type CanDeactivateFn<T = any> = (
  component: T,
  currentRoute: ActivatedRouteSnapshot,
  currentState: RouterStateSnapshot,
  nextState: RouterStateSnapshot,
) => MaybeAsync<GuardResult>;

export type CanMatchFn = (
  route: Route,
  segments: UrlSegment[],
) => MaybeAsync<GuardResult>;

export type ResolveFn<T> = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => MaybeAsync<T>;

export type ResolveData = {
  [key: string | symbol]: ResolveFn<any>;
};

export type RedirectFunction = (
  redirectData: Pick<
    ActivatedRouteSnapshot,
    | "params"
    | "data"
    | "queryParams"
    | "fragment"
    | "routeConfig"
    | "url"
    | "outlet"
    | "title"
  >,
) => string | UrlTree;

export interface Route {
  path?: string;
  pathMatch?: "prefix" | "full";
  component?: Type<any>;
  loadComponent?: () => Promise<Type<any> | { default: Type<any> }>;
  redirectTo?: string | RedirectFunction;
  outlet?: string;
  canActivate?: CanActivateFn[];
  canMatch?: CanMatchFn[];
  canActivateChild?: CanActivateChildFn[];
  canDeactivate?: CanDeactivateFn<any>[];
  data?: Data;
  resolve?: ResolveData;
  title?: string | ResolveFn<string>;
  children?: Routes;
  loadChildren?: () => Promise<Routes | { default: Routes }>;
  providers?: Array<Provider | EnvironmentProviders>;
}

export type Routes = Route[];

/**
 * Immutable snapshot of an activated route at a point in time.
 */
export class ActivatedRouteSnapshot {
  parent: ActivatedRouteSnapshot | null = null;
  children: ActivatedRouteSnapshot[] = [];

  constructor(
    public url: UrlSegment[] = [],
    public params: Params = {},
    public queryParams: Params = {},
    public fragment: string | null = null,
    public data: Data = {},
    public outlet: string = PRIMARY_OUTLET,
    public component: Type<any> | null = null,
    public readonly routeConfig: Route | null = null,
    public readonly title: string | undefined = undefined,
  ) {}

  get root(): ActivatedRouteSnapshot {
    if (!this.parent) return this;
    let curr: ActivatedRouteSnapshot = this.parent;
    while (curr.parent) {
      curr = curr.parent;
    }
    return curr;
  }

  get firstChild(): ActivatedRouteSnapshot | null {
    return this.children[0] ?? null;
  }

  get paramMap(): ParamMap {
    return convertToParamMap(this.params);
  }

  get queryParamMap(): ParamMap {
    return convertToParamMap(this.queryParams);
  }

  get pathFromRoot(): ActivatedRouteSnapshot[] {
    const path: ActivatedRouteSnapshot[] = [this];
    let curr = this.parent;
    while (curr) {
      path.unshift(curr);
      curr = curr.parent;
    }
    return path;
  }
}

/**
 * Immutable snapshot of the router state at a point in time.
 */
export class RouterStateSnapshot {
  constructor(
    public url: string,
    public root: ActivatedRouteSnapshot,
  ) {}
}

class BehaviorSubjectStream<T> implements InteropObservable<T> {
  readonly #signal: WritableSignal<T>;
  readonly #listeners = new Set<Observer<T>>();

  constructor(initialValue: T) {
    this.#signal = signal(initialValue);
    (this as unknown as Record<PropertyKey, unknown>)[ObservableSymbol] = () =>
      this;
    (this as unknown as Record<PropertyKey, unknown>)["@@observable"] = () =>
      this;
  }

  get signal(): Signal<T> {
    return this.#signal.asReadonly();
  }

  get value(): T {
    return untrack(() => this.#signal());
  }

  next(value: T): void {
    this.#signal.set(value);
    for (const observer of Array.from(this.#listeners)) {
      untrack(() => observer.next?.(value));
    }
  }

  subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): Unsubscribable {
    const observer: Observer<T> =
      typeof observerOrNext === "function"
        ? { next: observerOrNext, error, complete }
        : {
            next: observerOrNext?.next?.bind(observerOrNext),
            error: (observerOrNext?.error ?? error)?.bind(observerOrNext),
            complete: (observerOrNext?.complete ?? complete)?.bind(
              observerOrNext,
            ),
          };
    this.#listeners.add(observer);
    untrack(() => observer.next?.(this.value));
    return {
      unsubscribe: () => {
        this.#listeners.delete(observer);
      },
    };
  }
}

class EventStream<T> implements InteropObservable<T> {
  readonly #listeners = new Set<Observer<T>>();

  constructor() {
    (this as unknown as Record<PropertyKey, unknown>)[ObservableSymbol] = () =>
      this;
    (this as unknown as Record<PropertyKey, unknown>)["@@observable"] = () =>
      this;
  }

  emit(value: T): void {
    for (const observer of Array.from(this.#listeners)) {
      untrack(() => observer.next?.(value));
    }
  }

  subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): Unsubscribable {
    const observer: Observer<T> =
      typeof observerOrNext === "function"
        ? { next: observerOrNext, error, complete }
        : {
            next: observerOrNext?.next?.bind(observerOrNext),
            error: (observerOrNext?.error ?? error)?.bind(observerOrNext),
            complete: (observerOrNext?.complete ?? complete)?.bind(
              observerOrNext,
            ),
          };
    this.#listeners.add(observer);
    return {
      unsubscribe: () => {
        this.#listeners.delete(observer);
      },
    };
  }
}

/**
 * Live activated route exposing both RxJS-interop observables and Moonshine signals.
 */
export class ActivatedRoute {
  readonly #snapshotSignal: WritableSignal<ActivatedRouteSnapshot>;
  readonly #urlStream: BehaviorSubjectStream<UrlSegment[]>;
  readonly #paramsStream: BehaviorSubjectStream<Params>;
  readonly #queryParamsStream: BehaviorSubjectStream<Params>;
  readonly #fragmentStream: BehaviorSubjectStream<string | null>;
  readonly #dataStream: BehaviorSubjectStream<Data>;
  readonly #titleStream: BehaviorSubjectStream<string | undefined>;
  readonly #paramMapStream: BehaviorSubjectStream<ParamMap>;
  readonly #queryParamMapStream: BehaviorSubjectStream<ParamMap>;

  parent: ActivatedRoute | null = null;
  children: ActivatedRoute[] = [];

  constructor(
    initialSnapshot: ActivatedRouteSnapshot = new ActivatedRouteSnapshot(),
  ) {
    this.#snapshotSignal = signal(initialSnapshot);
    this.#urlStream = new BehaviorSubjectStream(initialSnapshot.url);
    this.#paramsStream = new BehaviorSubjectStream(initialSnapshot.params);
    this.#queryParamsStream = new BehaviorSubjectStream(
      initialSnapshot.queryParams,
    );
    this.#fragmentStream = new BehaviorSubjectStream(initialSnapshot.fragment);
    this.#dataStream = new BehaviorSubjectStream(initialSnapshot.data);
    this.#titleStream = new BehaviorSubjectStream(initialSnapshot.title);
    this.#paramMapStream = new BehaviorSubjectStream(initialSnapshot.paramMap);
    this.#queryParamMapStream = new BehaviorSubjectStream(
      initialSnapshot.queryParamMap,
    );
  }

  get snapshot(): ActivatedRouteSnapshot {
    return this.#snapshotSignal();
  }

  get snapshotSignal(): Signal<ActivatedRouteSnapshot> {
    return this.#snapshotSignal.asReadonly();
  }

  get url(): InteropObservable<UrlSegment[]> {
    return this.#urlStream;
  }

  get urlSignal(): Signal<UrlSegment[]> {
    return this.#urlStream.signal;
  }

  get params(): InteropObservable<Params> {
    return this.#paramsStream;
  }

  get paramsSignal(): Signal<Params> {
    return this.#paramsStream.signal;
  }

  get queryParams(): InteropObservable<Params> {
    return this.#queryParamsStream;
  }

  get queryParamsSignal(): Signal<Params> {
    return this.#queryParamsStream.signal;
  }

  get fragment(): InteropObservable<string | null> {
    return this.#fragmentStream;
  }

  get fragmentSignal(): Signal<string | null> {
    return this.#fragmentStream.signal;
  }

  get data(): InteropObservable<Data> {
    return this.#dataStream;
  }

  get dataSignal(): Signal<Data> {
    return this.#dataStream.signal;
  }

  get title(): InteropObservable<string | undefined> {
    return this.#titleStream;
  }

  get titleSignal(): Signal<string | undefined> {
    return this.#titleStream.signal;
  }

  get paramMap(): InteropObservable<ParamMap> {
    return this.#paramMapStream;
  }

  get paramMapSignal(): Signal<ParamMap> {
    return this.#paramMapStream.signal;
  }

  get queryParamMap(): InteropObservable<ParamMap> {
    return this.#queryParamMapStream;
  }

  get queryParamMapSignal(): Signal<ParamMap> {
    return this.#queryParamMapStream.signal;
  }

  get outlet(): string {
    return this.snapshot.outlet;
  }

  get component(): Type<any> | null {
    return this.snapshot.component;
  }

  get routeConfig(): Route | null {
    return this.snapshot.routeConfig;
  }

  get root(): ActivatedRoute {
    if (!this.parent) return this;
    let curr: ActivatedRoute = this.parent;
    while (curr.parent) {
      curr = curr.parent;
    }
    return curr;
  }

  get firstChild(): ActivatedRoute | null {
    return this.children[0] ?? null;
  }

  get pathFromRoot(): ActivatedRoute[] {
    const path: ActivatedRoute[] = [this];
    let curr = this.parent;
    while (curr) {
      path.unshift(curr);
      curr = curr.parent;
    }
    return path;
  }

  /** @internal */
  _applySnapshot(snapshot: ActivatedRouteSnapshot): void {
    batch(() => {
      this.#snapshotSignal.set(snapshot);
      this.#urlStream.next(snapshot.url);
      this.#paramsStream.next(snapshot.params);
      this.#queryParamsStream.next(snapshot.queryParams);
      this.#fragmentStream.next(snapshot.fragment);
      this.#dataStream.next(snapshot.data);
      this.#titleStream.next(snapshot.title);
      this.#paramMapStream.next(snapshot.paramMap);
      this.#queryParamMapStream.next(snapshot.queryParamMap);
    });
  }
}

export class RouterState {
  constructor(
    public root: ActivatedRoute,
    public snapshot: RouterStateSnapshot,
  ) {}
}

export interface Navigation {
  id: number;
  initialUrl: UrlTree;
  extractedUrl: UrlTree;
  finalUrl?: UrlTree;
  trigger: "imperative" | "popstate" | "hashchange";
  extras: NavigationExtras;
  previousNavigation: Navigation | null;
}

export interface IsActiveMatchOptions {
  matrixParams: "exact" | "subset" | "ignored";
  queryParams: "exact" | "subset" | "ignored";
  paths: "exact" | "subset";
  fragment: "exact" | "ignored";
}

function awaitMaybeAsync<T>(value: MaybeAsync<T>): Promise<T> {
  if (value && typeof (value as Promise<T>).then === "function") {
    return value as Promise<T>;
  }
  if (value && typeof (value as Subscribable<T>).subscribe === "function") {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let latest: T;
      let hasLatest = false;
      const finish = (cleanup: unknown) => {
        if (typeof cleanup === "function") cleanup();
        else if (
          cleanup &&
          typeof (cleanup as Unsubscribable).unsubscribe === "function"
        ) {
          (cleanup as Unsubscribable).unsubscribe();
        }
      };
      const sub = (value as Subscribable<T>).subscribe({
        next(v) {
          latest = v;
          hasLatest = true;
          if (!settled) {
            settled = true;
            queueMicrotask(() => finish(sub));
            resolve(v);
          }
        },
        error(err) {
          if (!settled) {
            settled = true;
            reject(err);
          }
        },
        complete() {
          if (!settled) {
            settled = true;
            resolve(hasLatest ? latest : (undefined as unknown as T));
          }
        },
      });
    });
  }
  return Promise.resolve(value as T);
}

interface MatchedNode {
  route: Route;
  consumed: UrlSegment[];
  params: Params;
  component: Type<any> | null;
  children: MatchedNode[];
}

async function resolveRouteChildren(route: Route): Promise<Routes | undefined> {
  if (route.children) return route.children;
  if (route.loadChildren) {
    const loaded = await route.loadChildren();
    return Array.isArray(loaded) ? loaded : loaded.default;
  }
  return undefined;
}

async function resolveRouteComponent(route: Route): Promise<Type<any> | null> {
  if (route.component) return route.component;
  if (route.loadComponent) {
    const loaded = await route.loadComponent();
    return typeof loaded === "function"
      ? loaded
      : (loaded as { default: Type<any> }).default;
  }
  return null;
}

function matchPathPattern(
  pattern: string,
  segments: UrlSegment[],
  pathMatch: "prefix" | "full" = "prefix",
): { matched: boolean; consumed: UrlSegment[]; params: Params } {
  if (pattern === "") {
    if (pathMatch === "full" && segments.length > 0) {
      return { matched: false, consumed: [], params: {} };
    }
    return { matched: true, consumed: [], params: {} };
  }
  if (pattern === "**") {
    return { matched: true, consumed: [...segments], params: {} };
  }
  const parts = pattern.split("/").filter(Boolean);
  if (segments.length < parts.length) {
    return { matched: false, consumed: [], params: {} };
  }
  if (pathMatch === "full" && segments.length !== parts.length) {
    return { matched: false, consumed: [], params: {} };
  }
  const params: Params = {};
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const seg = segments[i]!;
    if (part.startsWith(":")) {
      params[part.slice(1)] = seg.path;
    } else if (part !== seg.path) {
      return { matched: false, consumed: [], params: {} };
    }
  }
  return {
    matched: true,
    consumed: segments.slice(0, parts.length),
    params,
  };
}

/**
 * Host-free Angular `Router` service backed by Moonshine signals.
 */
export class Router {
  readonly #urlSignal: WritableSignal<string> = signal("/");
  readonly #currentNavSignal: WritableSignal<Navigation | null> = signal(null);
  readonly #events = new EventStream<RouterEvent>();
  readonly #serializer: UrlSerializer = new DefaultUrlSerializer();
  readonly #rootRoute: ActivatedRoute;
  readonly #activeRoute: ActivatedRoute;
  readonly #injector: Injector | null;
  #stateSnapshot: RouterStateSnapshot;
  #navId = 0;
  #navigated = false;
  config: Routes;

  constructor(
    config: Routes = [],
    injector: Injector | null = getCurrentInjector() ?? null,
  ) {
    this.config = [...config];
    this.#injector = injector;
    const rootSnap = new ActivatedRouteSnapshot(
      [],
      {},
      {},
      null,
      {},
      PRIMARY_OUTLET,
      null,
      null,
      undefined,
    );
    this.#stateSnapshot = new RouterStateSnapshot("/", rootSnap);
    this.#rootRoute = new ActivatedRoute(rootSnap);
    this.#activeRoute = new ActivatedRoute(rootSnap);
  }

  get activatedRoute(): ActivatedRoute {
    return this.#activeRoute;
  }

  get url(): string {
    return this.#urlSignal();
  }

  get urlSignal(): Signal<string> {
    return this.#urlSignal.asReadonly();
  }

  get events(): InteropObservable<RouterEvent> {
    return this.#events;
  }

  get currentNavigation(): Signal<Navigation | null> {
    return this.#currentNavSignal.asReadonly();
  }

  get navigated(): boolean {
    return this.#navigated;
  }

  get routerState(): RouterState {
    return new RouterState(this.#rootRoute, this.#stateSnapshot);
  }

  resetConfig(config: Routes): void {
    this.config = [...config];
  }

  parseUrl(url: string): UrlTree {
    return this.#serializer.parse(url);
  }

  serializeUrl(url: UrlTree): string {
    return this.#serializer.serialize(url);
  }

  createUrlTree(
    commands: readonly any[],
    navigationExtras: UrlCreationOptions = {},
  ): UrlTree {
    const {
      relativeTo,
      queryParams,
      fragment,
      queryParamsHandling,
      preserveFragment,
    } = navigationExtras;

    let baseSegments: string[] = [];
    if (relativeTo) {
      for (const snap of relativeTo.snapshot.pathFromRoot) {
        for (const seg of snap.url) {
          if (seg.path) baseSegments.push(seg.path);
        }
      }
    }

    const parts: string[] = [];
    let startedFromRoot = false;
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd == null) continue;
      if (typeof cmd === "object" && !Array.isArray(cmd)) {
        continue;
      }
      const str = String(cmd);
      if (i === 0 && str.startsWith("/")) {
        startedFromRoot = true;
      }
      for (const piece of str.split("/")) {
        if (!piece || piece === ".") continue;
        if (piece === "..") {
          if (startedFromRoot) {
            parts.pop();
          } else if (parts.length > 0) {
            parts.pop();
          } else {
            baseSegments.pop();
          }
        } else {
          parts.push(piece);
        }
      }
    }

    const finalSegments = (
      startedFromRoot ? parts : [...baseSegments, ...parts]
    ).map((p) => new UrlSegment(p));

    const currentTree = this.parseUrl(untrack(() => this.#urlSignal()));
    let nextQueryParams: Params = {};
    if (queryParamsHandling === "preserve") {
      nextQueryParams = { ...currentTree.queryParams };
    } else if (queryParamsHandling === "merge") {
      nextQueryParams = {
        ...currentTree.queryParams,
        ...queryParams,
      };
      for (const [k, v] of Object.entries(nextQueryParams)) {
        if (v === null || v === undefined) {
          delete nextQueryParams[k];
        }
      }
    } else if (queryParams != null) {
      nextQueryParams = { ...queryParams };
    }

    const nextFragment = preserveFragment
      ? currentTree.fragment
      : fragment !== undefined
        ? fragment
        : null;

    const root =
      finalSegments.length > 0
        ? new UrlSegmentGroup([], {
            [PRIMARY_OUTLET]: new UrlSegmentGroup(finalSegments),
          })
        : new UrlSegmentGroup();

    return new UrlTree(root, nextQueryParams, nextFragment);
  }

  isActive(
    url: string | UrlTree,
    matchOptions: boolean | IsActiveMatchOptions = false,
  ): boolean {
    const targetTree = typeof url === "string" ? this.parseUrl(url) : url;
    const currentTree = this.parseUrl(this.#urlSignal());
    const opts: IsActiveMatchOptions =
      typeof matchOptions === "boolean"
        ? {
            paths: matchOptions ? "exact" : "subset",
            queryParams: matchOptions ? "exact" : "subset",
            fragment: "ignored",
            matrixParams: "ignored",
          }
        : matchOptions;

    const currentSegs =
      currentTree.root.children[PRIMARY_OUTLET]?.segments ?? [];
    const targetSegs = targetTree.root.children[PRIMARY_OUTLET]?.segments ?? [];

    if (opts.paths === "exact") {
      if (currentSegs.length !== targetSegs.length) return false;
      for (let i = 0; i < targetSegs.length; i++) {
        if (currentSegs[i]!.path !== targetSegs[i]!.path) return false;
      }
    } else {
      if (currentSegs.length < targetSegs.length) return false;
      for (let i = 0; i < targetSegs.length; i++) {
        if (currentSegs[i]!.path !== targetSegs[i]!.path) return false;
      }
    }

    if (opts.queryParams === "exact") {
      const cKeys = Object.keys(currentTree.queryParams);
      const tKeys = Object.keys(targetTree.queryParams);
      if (cKeys.length !== tKeys.length) return false;
      for (const k of tKeys) {
        if (
          String(currentTree.queryParams[k]) !==
          String(targetTree.queryParams[k])
        ) {
          return false;
        }
      }
    } else if (opts.queryParams === "subset") {
      for (const [k, v] of Object.entries(targetTree.queryParams)) {
        if (String(currentTree.queryParams[k]) !== String(v)) {
          return false;
        }
      }
    }

    if (opts.fragment === "exact") {
      if (currentTree.fragment !== targetTree.fragment) return false;
    }

    return true;
  }

  navigate(
    commands: readonly any[],
    extras: NavigationExtras = {},
  ): Promise<boolean> {
    return this.navigateByUrl(this.createUrlTree(commands, extras), extras);
  }

  async navigateByUrl(
    url: string | UrlTree,
    extras: NavigationBehaviorOptions = {},
  ): Promise<boolean> {
    const initialTree = typeof url === "string" ? this.parseUrl(url) : url;
    return this.#executeNavigation(initialTree, extras, 0);
  }

  #runWithContext<T>(fn: () => T): T {
    const active = this.#injector ?? getCurrentInjector();
    if (active) {
      return runInInjectionContext(active, fn);
    }
    return fn();
  }

  async #executeNavigation(
    initialTree: UrlTree,
    extras: NavigationBehaviorOptions,
    redirectDepth: number,
  ): Promise<boolean> {
    if (redirectDepth > 20) {
      throw new Error("Router redirect loop detected");
    }
    const navId = ++this.#navId;
    const rawUrl = this.serializeUrl(initialTree);
    const prevNav = untrack(() => this.#currentNavSignal());
    const nav: Navigation = {
      id: navId,
      initialUrl: initialTree,
      extractedUrl: initialTree,
      trigger: "imperative",
      extras,
      previousNavigation: prevNav,
    };
    this.#currentNavSignal.set(nav);
    this.#events.emit(new NavigationStart(navId, rawUrl));

    try {
      const resolved = await this.#recognizeAndRedirect(initialTree, 0);
      if (!resolved) {
        this.#events.emit(
          new NavigationError(
            navId,
            rawUrl,
            new Error(`Cannot match any routes. URL Segment: '${rawUrl}'`),
          ),
        );
        this.#currentNavSignal.set(null);
        return false;
      }

      const { finalTree, matchedNodes } = resolved;
      nav.finalUrl = finalTree;
      const finalUrl = this.serializeUrl(finalTree);
      const stateSnapshot = this.#buildStateSnapshot(
        finalUrl,
        finalTree,
        matchedNodes,
      );

      this.#events.emit(
        new RoutesRecognized(navId, rawUrl, finalUrl, stateSnapshot),
      );
      this.#events.emit(
        new GuardsCheckStart(navId, rawUrl, finalUrl, stateSnapshot),
      );

      const guardOutcome = await this.#runGuards(stateSnapshot);
      if (guardOutcome !== true) {
        this.#events.emit(
          new GuardsCheckEnd(navId, rawUrl, finalUrl, stateSnapshot, false),
        );
        if (guardOutcome instanceof UrlTree) {
          this.#events.emit(
            new NavigationCancel(navId, rawUrl, "Redirecting from guard"),
          );
          return this.#executeNavigation(
            guardOutcome,
            extras,
            redirectDepth + 1,
          );
        }
        if (guardOutcome instanceof RedirectCommand) {
          this.#events.emit(
            new NavigationCancel(navId, rawUrl, "RedirectCommand from guard"),
          );
          return this.#executeNavigation(
            guardOutcome.redirectTo,
            guardOutcome.navigationBehaviorOptions ?? extras,
            redirectDepth + 1,
          );
        }
        this.#events.emit(
          new NavigationCancel(navId, rawUrl, "Guard rejected navigation"),
        );
        this.#currentNavSignal.set(null);
        return false;
      }

      this.#events.emit(
        new GuardsCheckEnd(navId, rawUrl, finalUrl, stateSnapshot, true),
      );
      this.#events.emit(
        new ResolveStart(navId, rawUrl, finalUrl, stateSnapshot),
      );

      const resolveOutcome = await this.#runResolvers(stateSnapshot);
      if (resolveOutcome instanceof UrlTree) {
        this.#events.emit(
          new NavigationCancel(navId, rawUrl, "Redirecting from resolver"),
        );
        return this.#executeNavigation(
          resolveOutcome,
          extras,
          redirectDepth + 1,
        );
      }
      if (resolveOutcome instanceof RedirectCommand) {
        this.#events.emit(
          new NavigationCancel(navId, rawUrl, "RedirectCommand from resolver"),
        );
        return this.#executeNavigation(
          resolveOutcome.redirectTo,
          resolveOutcome.navigationBehaviorOptions ?? extras,
          redirectDepth + 1,
        );
      }

      this.#events.emit(new ResolveEnd(navId, rawUrl, finalUrl, stateSnapshot));

      batch(() => {
        this.#stateSnapshot = stateSnapshot;
        if (!extras.skipLocationChange) {
          this.#urlSignal.set(finalUrl);
        }
        this.#syncActivatedRoutes(this.#rootRoute, stateSnapshot.root);
        this.#navigated = true;
        this.#currentNavSignal.set(null);
      });

      this.#events.emit(new NavigationEnd(navId, rawUrl, finalUrl));
      return true;
    } catch (error) {
      this.#events.emit(new NavigationError(navId, rawUrl, error));
      this.#currentNavSignal.set(null);
      throw error;
    }
  }

  async #recognizeAndRedirect(
    tree: UrlTree,
    depth: number,
  ): Promise<{ finalTree: UrlTree; matchedNodes: MatchedNode[] } | null> {
    if (depth > 20) {
      throw new Error("Router redirect loop detected");
    }
    const segments = tree.root.children[PRIMARY_OUTLET]?.segments ?? [];
    const matchResult = await this.#matchRoutes(this.config, segments, tree);
    if (!matchResult) return null;
    if (matchResult.redirectTree) {
      return this.#recognizeAndRedirect(matchResult.redirectTree, depth + 1);
    }
    return { finalTree: tree, matchedNodes: matchResult.nodes };
  }

  async #matchRoutes(
    routes: Routes,
    segments: UrlSegment[],
    fullTree: UrlTree,
  ): Promise<{
    nodes: MatchedNode[];
    redirectTree?: UrlTree;
  } | null> {
    for (const route of routes) {
      const pattern = route.path ?? "";
      const pathMatch =
        route.pathMatch ??
        (route.redirectTo !== undefined && pattern === "" ? "full" : "prefix");
      const m = matchPathPattern(pattern, segments, pathMatch);
      if (!m.matched) continue;

      if (route.canMatch && route.canMatch.length > 0) {
        let canMatchOk = true;
        for (const fn of route.canMatch) {
          const res = await awaitMaybeAsync(
            this.#runWithContext(() => fn(route, m.consumed)),
          );
          if (res instanceof UrlTree) {
            return { nodes: [], redirectTree: res };
          }
          if (res instanceof RedirectCommand) {
            return { nodes: [], redirectTree: res.redirectTo };
          }
          if (!res) {
            canMatchOk = false;
            break;
          }
        }
        if (!canMatchOk) continue;
      }

      const remaining = segments.slice(m.consumed.length);

      if (route.redirectTo !== undefined) {
        let redirectTarget: string | UrlTree;
        if (typeof route.redirectTo === "function") {
          const redirectFn = route.redirectTo;
          redirectTarget = this.#runWithContext(() =>
            redirectFn({
              params: m.params,
              data: { ...route.data },
              queryParams: fullTree.queryParams,
              fragment: fullTree.fragment,
              routeConfig: route,
              url: m.consumed,
              outlet: route.outlet ?? PRIMARY_OUTLET,
              title: typeof route.title === "string" ? route.title : undefined,
            }),
          );
        } else {
          let targetStr = route.redirectTo;
          for (const [k, v] of Object.entries(m.params)) {
            targetStr = targetStr.replace(`:${k}`, String(v));
          }
          if (remaining.length > 0) {
            const remStr = remaining.map((s) => s.path).join("/");
            targetStr = `${targetStr.replace(/\/+$/, "")}/${remStr}`;
          }
          redirectTarget = targetStr;
        }
        const redirectTree =
          typeof redirectTarget === "string"
            ? new UrlTree(
                this.parseUrl(redirectTarget).root,
                fullTree.queryParams,
                fullTree.fragment,
              )
            : redirectTarget;
        return { nodes: [], redirectTree };
      }

      const childRoutes = await resolveRouteChildren(route);
      if (childRoutes && childRoutes.length > 0) {
        const childMatch = await this.#matchRoutes(
          childRoutes,
          remaining,
          fullTree,
        );
        if (!childMatch) continue;
        if (childMatch.redirectTree) {
          return childMatch;
        }
        const component = await resolveRouteComponent(route);
        return {
          nodes: [
            {
              route,
              consumed: m.consumed,
              params: m.params,
              component,
              children: childMatch.nodes,
            },
          ],
        };
      }

      if (remaining.length === 0) {
        const component = await resolveRouteComponent(route);
        return {
          nodes: [
            {
              route,
              consumed: m.consumed,
              params: m.params,
              component,
              children: [],
            },
          ],
        };
      }
    }
    return null;
  }

  #buildStateSnapshot(
    url: string,
    tree: UrlTree,
    nodes: MatchedNode[],
  ): RouterStateSnapshot {
    const rootSnap = new ActivatedRouteSnapshot(
      [],
      {},
      tree.queryParams,
      tree.fragment,
      {},
      PRIMARY_OUTLET,
      null,
      null,
      undefined,
    );

    const buildChildren = (
      parentSnap: ActivatedRouteSnapshot,
      matchedList: MatchedNode[],
    ): ActivatedRouteSnapshot[] => {
      return matchedList.map((node) => {
        const mergedParams = { ...parentSnap.params, ...node.params };
        const mergedData = { ...parentSnap.data, ...node.route.data };
        const staticTitle =
          typeof node.route.title === "string" ? node.route.title : undefined;
        const snap = new ActivatedRouteSnapshot(
          node.consumed,
          mergedParams,
          tree.queryParams,
          tree.fragment,
          mergedData,
          node.route.outlet ?? PRIMARY_OUTLET,
          node.component,
          node.route,
          staticTitle,
        );
        snap.parent = parentSnap;
        snap.children = buildChildren(snap, node.children);
        return snap;
      });
    };

    rootSnap.children = buildChildren(rootSnap, nodes);
    return new RouterStateSnapshot(url, rootSnap);
  }

  async #runGuards(nextState: RouterStateSnapshot): Promise<GuardResult> {
    // 1. Run CanDeactivate on existing active routes if navigating away
    const currentWaitList: Array<{
      snap: ActivatedRouteSnapshot;
      guards: CanDeactivateFn<any>[];
    }> = [];
    const collectDeactivate = (snap: ActivatedRouteSnapshot) => {
      if (snap.routeConfig?.canDeactivate?.length) {
        currentWaitList.push({
          snap,
          guards: snap.routeConfig.canDeactivate,
        });
      }
      for (const child of snap.children) {
        collectDeactivate(child);
      }
    };
    if (this.#navigated) {
      collectDeactivate(this.#stateSnapshot.root);
      for (const item of currentWaitList) {
        for (const fn of item.guards) {
          const res = await awaitMaybeAsync(
            this.#runWithContext(() =>
              fn(null, item.snap, this.#stateSnapshot, nextState),
            ),
          );
          if (res !== true) return res;
        }
      }
    }

    // 2. Run CanActivate and CanActivateChild top-down on nextState
    const checkNode = async (
      snap: ActivatedRouteSnapshot,
    ): Promise<GuardResult> => {
      if (snap.parent?.routeConfig?.canActivateChild?.length) {
        for (const fn of snap.parent.routeConfig.canActivateChild) {
          const res = await awaitMaybeAsync(
            this.#runWithContext(() => fn(snap, nextState)),
          );
          if (res !== true) return res;
        }
      }
      if (snap.routeConfig?.canActivate?.length) {
        for (const fn of snap.routeConfig.canActivate) {
          const res = await awaitMaybeAsync(
            this.#runWithContext(() => fn(snap, nextState)),
          );
          if (res !== true) return res;
        }
      }
      for (const child of snap.children) {
        const childRes = await checkNode(child);
        if (childRes !== true) return childRes;
      }
      return true;
    };

    for (const child of nextState.root.children) {
      const res = await checkNode(child);
      if (res !== true) return res;
    }
    return true;
  }

  async #runResolvers(
    state: RouterStateSnapshot,
  ): Promise<void | UrlTree | RedirectCommand> {
    const resolveNode = async (
      snap: ActivatedRouteSnapshot,
    ): Promise<void | UrlTree | RedirectCommand> => {
      const resolveConfig = snap.routeConfig?.resolve;
      if (resolveConfig) {
        for (const key of Reflect.ownKeys(resolveConfig)) {
          const fn = resolveConfig[key];
          if (typeof fn === "function") {
            const val = await awaitMaybeAsync(
              this.#runWithContext(() => fn(snap, state)),
            );
            if (val instanceof UrlTree || val instanceof RedirectCommand) {
              return val;
            }
            snap.data[key] = val;
          }
        }
      }
      if (typeof snap.routeConfig?.title === "function") {
        const titleFn = snap.routeConfig.title;
        const resolvedTitle = await awaitMaybeAsync(
          this.#runWithContext(() => titleFn(snap, state)),
        );
        (snap as { title: string | undefined }).title = resolvedTitle;
      }
      for (const child of snap.children) {
        child.data = { ...snap.data, ...child.data };
        const childOutcome = await resolveNode(child);
        if (childOutcome) return childOutcome;
      }
    };

    for (const child of state.root.children) {
      const outcome = await resolveNode(child);
      if (outcome) return outcome;
    }
  }

  #syncActivatedRoutes(
    route: ActivatedRoute,
    snap: ActivatedRouteSnapshot,
  ): void {
    route._applySnapshot(snap);
    const nextChildren: ActivatedRoute[] = [];
    for (let i = 0; i < snap.children.length; i++) {
      const childSnap = snap.children[i]!;
      const existingChild = route.children[i];
      if (existingChild) {
        existingChild.parent = route;
        this.#syncActivatedRoutes(existingChild, childSnap);
        nextChildren.push(existingChild);
      } else {
        const created = new ActivatedRoute(childSnap);
        created.parent = route;
        this.#syncActivatedRoutes(created, childSnap);
        nextChildren.push(created);
      }
    }
    route.children = nextChildren;
    if (route === this.#rootRoute) {
      let leafSnap = snap;
      let leafRoute: ActivatedRoute = route;
      while (leafSnap.firstChild) {
        leafSnap = leafSnap.firstChild;
        leafRoute = leafRoute.firstChild ?? leafRoute;
      }
      this.#activeRoute.parent = leafRoute.parent;
      this.#activeRoute.children = leafRoute.children;
      this.#activeRoute._applySnapshot(leafSnap);
    }
  }
}

export enum RouterFeatureKind {
  ComponentInputBindingFeature = 0,
  RouterConfigurationFeature = 1,
  InMemoryScrollingFeature = 2,
  EnabledBlockingInitialNavigationFeature = 3,
  DisabledInitialNavigationFeature = 4,
  DebugTracingFeature = 5,
  ViewTransitionsFeature = 6,
  HashLocationFeature = 7,
}

export interface RouterFeature<
  Kind extends RouterFeatureKind = RouterFeatureKind,
> {
  ɵkind: Kind;
  ɵproviders: Provider[];
}

export interface ExtraOptions {
  enableTracing?: boolean;
  useHash?: boolean;
  initialNavigation?: "enabledBlocking" | "enabledNonBlocking" | "disabled";
  paramsInheritanceStrategy?: "emptyOnly" | "always";
  canceledNavigationResolution?: "replace" | "computed";
  urlUpdateStrategy?: "deferred" | "eager";
  onSameUrlNavigation?: "reload" | "ignore";
  bindToComponentInputs?: boolean;
}

export interface InMemoryScrollingOptions {
  anchorScrolling?: "disabled" | "enabled";
  scrollPositionRestoration?: "disabled" | "enabled" | "top";
}

export const ROUTER_CONFIGURATION = new InjectionToken<ExtraOptions>(
  "ROUTER_CONFIGURATION",
  { factory: () => ({}) },
);

export const ROUTER_ROUTES = new InjectionToken<Routes>("ROUTER_ROUTES", {
  factory: () => [],
});

export function withComponentInputBinding(): RouterFeature<RouterFeatureKind.ComponentInputBindingFeature> {
  return {
    ɵkind: RouterFeatureKind.ComponentInputBindingFeature,
    ɵproviders: [
      {
        provide: ROUTER_CONFIGURATION,
        useValue: { bindToComponentInputs: true },
      },
    ],
  };
}

export function withRouterConfig(
  options: ExtraOptions,
): RouterFeature<RouterFeatureKind.RouterConfigurationFeature> {
  return {
    ɵkind: RouterFeatureKind.RouterConfigurationFeature,
    ɵproviders: [{ provide: ROUTER_CONFIGURATION, useValue: options }],
  };
}

export function withInMemoryScrolling(
  options: InMemoryScrollingOptions = {},
): RouterFeature<RouterFeatureKind.InMemoryScrollingFeature> {
  return {
    ɵkind: RouterFeatureKind.InMemoryScrollingFeature,
    ɵproviders: [
      {
        provide: new InjectionToken<InMemoryScrollingOptions>(
          "IN_MEMORY_SCROLLING_OPTIONS",
        ),
        useValue: options,
      },
    ],
  };
}

export function withEnabledBlockingInitialNavigation(): RouterFeature<RouterFeatureKind.EnabledBlockingInitialNavigationFeature> {
  return {
    ɵkind: RouterFeatureKind.EnabledBlockingInitialNavigationFeature,
    ɵproviders: [
      {
        provide: ROUTER_CONFIGURATION,
        useValue: { initialNavigation: "enabledBlocking" },
      },
    ],
  };
}

export function withDisabledInitialNavigation(): RouterFeature<RouterFeatureKind.DisabledInitialNavigationFeature> {
  return {
    ɵkind: RouterFeatureKind.DisabledInitialNavigationFeature,
    ɵproviders: [
      {
        provide: ROUTER_CONFIGURATION,
        useValue: { initialNavigation: "disabled" },
      },
    ],
  };
}

export function withDebugTracing(): RouterFeature<RouterFeatureKind.DebugTracingFeature> {
  return {
    ɵkind: RouterFeatureKind.DebugTracingFeature,
    ɵproviders: [
      {
        provide: ROUTER_CONFIGURATION,
        useValue: { enableTracing: true },
      },
    ],
  };
}

export function withViewTransitions(): RouterFeature<RouterFeatureKind.ViewTransitionsFeature> {
  return {
    ɵkind: RouterFeatureKind.ViewTransitionsFeature,
    ɵproviders: [],
  };
}

export function withHashLocation(): RouterFeature<RouterFeatureKind.HashLocationFeature> {
  return {
    ɵkind: RouterFeatureKind.HashLocationFeature,
    ɵproviders: [
      {
        provide: ROUTER_CONFIGURATION,
        useValue: { useHash: true },
      },
    ],
  };
}

/**
 * Configures and provides the host-free Angular `Router` and `ActivatedRoute` in an `EnvironmentInjector`.
 */
export function provideRouter(
  routes: Routes,
  ...features: RouterFeature<any>[]
): EnvironmentProviders {
  const featureProviders: Provider[] = [];
  for (const feature of features) {
    featureProviders.push(...feature.ɵproviders);
  }
  return makeEnvironmentProviders([
    { provide: ROUTER_ROUTES, useValue: routes },
    {
      provide: UrlSerializer,
      useFactory: () => new DefaultUrlSerializer(),
    },
    ...featureProviders,
    {
      provide: Router,
      useFactory: () => {
        const configuredRoutes = inject(ROUTER_ROUTES);
        const injector = getCurrentInjector();
        return new Router(configuredRoutes, injector);
      },
    },
    {
      provide: ActivatedRoute,
      useFactory: () => {
        const router = inject(Router);
        return router.activatedRoute;
      },
    },
  ]);
}
