/** Independent Svelte 5 reactivity classes and createSubscriber on the Moonshine graph. */
import { batch, createSignal, untrack, type Signal } from "@tschk/moonshine";
import {
  collectDeps,
  hasValueDemand,
  isTracking,
} from "@tschk/moonshine/tracking";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { getOwner, onCleanup, type Owner } from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  recordHistory,
  trackHistoryRead,
  withHistoryMutation,
} from "./history";
import {
  notifyTrackableUnsubscribe,
  registerDemandCheck,
} from "./store-demand";

const trackedOwners = /* @__PURE__ */ new WeakSet<Owner>();

function trackSignal(
  target: object,
  key: PropertyKey,
  sig: Signal<number>,
): void {
  if (!isTracking()) return;
  sig();
  trackHistoryRead(target, key);
}

function bumpSignal(
  target: object,
  key: PropertyKey,
  sig: Signal<number>,
): void {
  withHistoryMutation(() => {
    const prev = sig.peek();
    const next = prev + 1;
    recordHistory(target, key, prev, next);
    sig.set(next);
  });
}

export function createSubscriber(
  start: (update: () => void) => (() => void) | void,
): () => void {
  if (typeof start !== "function") {
    throw new TypeError("createSubscriber requires a start function");
  }
  let active = false;
  let stop: (() => void) | void;
  let unregisterDemand: (() => void) | undefined;
  const version = createSignal(0);
  const versionNode = collectDeps(() => version())[0]!;
  const originalSubscribe = versionNode.subscribe;
  versionNode.subscribe = (...args) => {
    const unsubscribe = originalSubscribe(...args);
    return () => {
      unsubscribe();
      notifyTrackableUnsubscribe();
    };
  };
  const update = () => {
    if (!active) return;
    bumpSignal(version, "value", version);
  };
  return () => {
    if (
      isSSRRendering() ||
      peekComponentContext()?.mode === "ssr" ||
      !isTracking() ||
      getOwner()?.disposed
    ) {
      return;
    }
    const owner = getOwner();
    if (owner && !trackedOwners.has(owner)) {
      trackedOwners.add(owner);
      onCleanup(notifyTrackableUnsubscribe);
    }
    version();
    trackHistoryRead(version, "value");
    if (!active) {
      active = true;
      stop = untrack(() => start(update));
      unregisterDemand = registerDemandCheck(() => {
        if (active && !hasValueDemand(versionNode)) {
          active = false;
          const cleanup = stop;
          stop = undefined;
          unregisterDemand?.();
          unregisterDemand = undefined;
          version.set((n) => n + 1);
          if (typeof cleanup === "function") {
            untrack(() => cleanup());
          }
        }
      });
      notifyTrackableUnsubscribe();
    }
  };
}

export class ReactiveValue<T> {
  readonly #fn: () => T;
  readonly #subscribe: () => void;

  constructor(
    fn: () => T,
    onsubscribe: (update: () => void) => void | (() => void),
  ) {
    if (typeof fn !== "function") {
      throw new TypeError("ReactiveValue requires a getter function");
    }
    if (typeof onsubscribe !== "function") {
      throw new TypeError("ReactiveValue requires an onsubscribe function");
    }
    this.#fn = fn;
    this.#subscribe = createSubscriber(onsubscribe);
  }

  get current(): T {
    this.#subscribe();
    return this.#fn();
  }
}

const parenthesisRegex = /\(.+\)/;
const nonParenthesizedKeywords = new Set([
  "all",
  "print",
  "screen",
  "and",
  "or",
  "not",
  "only",
]);

export class MediaQuery extends ReactiveValue<boolean> {
  constructor(query: string, fallback?: boolean) {
    const fallbackValue = Boolean(fallback);
    if (
      isSSRRendering() ||
      peekComponentContext()?.mode === "ssr" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      super(
        () => fallbackValue,
        () => {},
      );
      return;
    }
    const finalQuery =
      parenthesisRegex.test(query) ||
      query
        .split(/[\s,]+/)
        .some((keyword) => nonParenthesizedKeywords.has(keyword.trim()))
        ? query
        : `(${query})`;
    const mql = window.matchMedia(finalQuery);
    super(
      () =>
        isSSRRendering() || peekComponentContext()?.mode === "ssr"
          ? fallbackValue
          : mql.matches,
      (update) => {
        mql.addEventListener("change", update);
        return () => {
          mql.removeEventListener("change", update);
        };
      },
    );
  }
}

export class SvelteDate extends Date {
  readonly #time: Signal<number>;

  constructor(...params: any[]) {
    super(...(params as []));
    this.#time = createSignal(super.getTime());
  }

  #read(): void {
    trackSignal(this, "time", this.#time);
  }

  #write(next: number): number {
    const prev = this.#time.peek();
    if (!Object.is(prev, next)) {
      withHistoryMutation(() => {
        recordHistory(this, "time", prev, next);
        this.#time.set(next);
      });
    }
    return next;
  }

  override getDate(): number {
    this.#read();
    return super.getDate();
  }
  override getDay(): number {
    this.#read();
    return super.getDay();
  }
  override getFullYear(): number {
    this.#read();
    return super.getFullYear();
  }
  override getHours(): number {
    this.#read();
    return super.getHours();
  }
  override getMilliseconds(): number {
    this.#read();
    return super.getMilliseconds();
  }
  override getMinutes(): number {
    this.#read();
    return super.getMinutes();
  }
  override getMonth(): number {
    this.#read();
    return super.getMonth();
  }
  override getSeconds(): number {
    this.#read();
    return super.getSeconds();
  }
  override getTime(): number {
    this.#read();
    return super.getTime();
  }
  override getTimezoneOffset(): number {
    this.#read();
    return super.getTimezoneOffset();
  }
  override getUTCDate(): number {
    this.#read();
    return super.getUTCDate();
  }
  override getUTCDay(): number {
    this.#read();
    return super.getUTCDay();
  }
  override getUTCFullYear(): number {
    this.#read();
    return super.getUTCFullYear();
  }
  override getUTCHours(): number {
    this.#read();
    return super.getUTCHours();
  }
  override getUTCMilliseconds(): number {
    this.#read();
    return super.getUTCMilliseconds();
  }
  override getUTCMinutes(): number {
    this.#read();
    return super.getUTCMinutes();
  }
  override getUTCMonth(): number {
    this.#read();
    return super.getUTCMonth();
  }
  override getUTCSeconds(): number {
    this.#read();
    return super.getUTCSeconds();
  }
  override toDateString(): string {
    this.#read();
    return super.toDateString();
  }
  override toISOString(): string {
    this.#read();
    return super.toISOString();
  }
  override toJSON(key?: any): string {
    this.#read();
    return super.toJSON(key);
  }
  override toLocaleDateString(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    this.#read();
    return super.toLocaleDateString(locales, options);
  }
  override toLocaleString(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    this.#read();
    return super.toLocaleString(locales, options);
  }
  override toLocaleTimeString(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    this.#read();
    return super.toLocaleTimeString(locales, options);
  }
  override toString(): string {
    this.#read();
    return super.toString();
  }
  override toTimeString(): string {
    this.#read();
    return super.toTimeString();
  }
  override toUTCString(): string {
    this.#read();
    return super.toUTCString();
  }
  override valueOf(): number {
    this.#read();
    return super.valueOf();
  }
  override [Symbol.toPrimitive](hint: "default"): string;
  override [Symbol.toPrimitive](hint: "string"): string;
  override [Symbol.toPrimitive](hint: "number"): number;
  override [Symbol.toPrimitive](hint: string): string | number;
  override [Symbol.toPrimitive](
    hint: "default" | "string" | "number" | string,
  ): string | number {
    this.#read();
    return super[Symbol.toPrimitive](hint as "default");
  }

  override setDate(date: number): number {
    return this.#write(super.setDate(date));
  }
  override setFullYear(year: number, month?: number, date?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setFullYear(year)
        : arguments.length === 2
          ? super.setFullYear(year, month!)
          : super.setFullYear(year, month!, date!),
    );
  }
  override setHours(
    hours: number,
    min?: number,
    sec?: number,
    ms?: number,
  ): number {
    return this.#write(
      arguments.length === 1
        ? super.setHours(hours)
        : arguments.length === 2
          ? super.setHours(hours, min!)
          : arguments.length === 3
            ? super.setHours(hours, min!, sec!)
            : super.setHours(hours, min!, sec!, ms!),
    );
  }
  override setMilliseconds(ms: number): number {
    return this.#write(super.setMilliseconds(ms));
  }
  override setMinutes(min: number, sec?: number, ms?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setMinutes(min)
        : arguments.length === 2
          ? super.setMinutes(min, sec!)
          : super.setMinutes(min, sec!, ms!),
    );
  }
  override setMonth(month: number, date?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setMonth(month)
        : super.setMonth(month, date!),
    );
  }
  override setSeconds(sec: number, ms?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setSeconds(sec)
        : super.setSeconds(sec, ms!),
    );
  }
  override setTime(time: number): number {
    return this.#write(super.setTime(time));
  }
  override setUTCDate(date: number): number {
    return this.#write(super.setUTCDate(date));
  }
  override setUTCFullYear(year: number, month?: number, date?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setUTCFullYear(year)
        : arguments.length === 2
          ? super.setUTCFullYear(year, month!)
          : super.setUTCFullYear(year, month!, date!),
    );
  }
  override setUTCHours(
    hours: number,
    min?: number,
    sec?: number,
    ms?: number,
  ): number {
    return this.#write(
      arguments.length === 1
        ? super.setUTCHours(hours)
        : arguments.length === 2
          ? super.setUTCHours(hours, min!)
          : arguments.length === 3
            ? super.setUTCHours(hours, min!, sec!)
            : super.setUTCHours(hours, min!, sec!, ms!),
    );
  }
  override setUTCMilliseconds(ms: number): number {
    return this.#write(super.setUTCMilliseconds(ms));
  }
  override setUTCMinutes(min: number, sec?: number, ms?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setUTCMinutes(min)
        : arguments.length === 2
          ? super.setUTCMinutes(min, sec!)
          : super.setUTCMinutes(min, sec!, ms!),
    );
  }
  override setUTCMonth(month: number, date?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setUTCMonth(month)
        : super.setUTCMonth(month, date!),
    );
  }
  override setUTCSeconds(sec: number, ms?: number): number {
    return this.#write(
      arguments.length === 1
        ? super.setUTCSeconds(sec)
        : super.setUTCSeconds(sec, ms!),
    );
  }
}

export class SvelteSet<T = any> extends Set<T> {
  readonly #version = createSignal(0);
  readonly #items = new Map<T, Signal<number>>();
  readonly #ready: boolean;

  constructor(values?: Iterable<T> | null) {
    super();
    if (values) {
      for (const item of values) {
        super.add(item);
      }
    }
    this.#ready = true;
  }

  #readVersion(): void {
    trackSignal(this, "size", this.#version);
  }

  #bumpVersion(): void {
    bumpSignal(this, "size", this.#version);
  }

  override get size(): number {
    this.#readVersion();
    return super.size;
  }

  override has(value: T): boolean {
    const exists = super.has(value);
    if (isTracking()) {
      if (exists) {
        let sig = this.#items.get(value);
        if (!sig) {
          sig = createSignal(0);
          this.#items.set(value, sig);
        }
        trackSignal(this, value as PropertyKey, sig);
      } else {
        this.#readVersion();
      }
    }
    return exists;
  }

  override add(value: T): this {
    if (!this.#ready) {
      return super.add(value);
    }
    if (!super.has(value)) {
      super.add(value);
      this.#bumpVersion();
    }
    return this;
  }

  override delete(value: T): boolean {
    if (!super.has(value)) {
      return false;
    }
    const sig = this.#items.get(value);
    this.#items.delete(value);
    const removed = super.delete(value);
    batch(() => {
      if (sig) bumpSignal(this, value as PropertyKey, sig);
      this.#bumpVersion();
    });
    return removed;
  }

  override clear(): void {
    if (super.size === 0) return;
    const entries = Array.from(this.#items.entries());
    this.#items.clear();
    super.clear();
    batch(() => {
      for (const [key, sig] of entries) {
        bumpSignal(this, key as PropertyKey, sig);
      }
      this.#bumpVersion();
    });
  }

  override keys(): SetIterator<T> {
    this.#readVersion();
    return super.keys();
  }

  override values(): SetIterator<T> {
    this.#readVersion();
    return super.values();
  }

  override entries(): SetIterator<[T, T]> {
    this.#readVersion();
    return super.entries();
  }

  override [Symbol.iterator](): SetIterator<T> {
    this.#readVersion();
    return super[Symbol.iterator]();
  }

  override forEach(
    callbackfn: (value: T, value2: T, set: Set<T>) => void,
    thisArg?: any,
  ): void {
    this.#readVersion();
    super.forEach((v, v2) => callbackfn.call(thisArg, v, v2, this));
  }
}

export class SvelteMap<K = any, V = any> extends Map<K, V> {
  readonly #version = createSignal(0);
  readonly #valuesVersion = createSignal(0);
  readonly #items = new Map<K, Signal<number>>();
  readonly #ready: boolean;

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    super();
    if (entries) {
      for (const [k, v] of entries) {
        super.set(k, v);
      }
    }
    this.#ready = true;
  }

  #readVersion(): void {
    trackSignal(this, "size", this.#version);
  }

  #readValuesVersion(): void {
    trackSignal(this, "size", this.#version);
    trackSignal(this, "values", this.#valuesVersion);
  }

  #bumpVersion(): void {
    bumpSignal(this, "size", this.#version);
  }

  #bumpValuesVersion(): void {
    bumpSignal(this, "values", this.#valuesVersion);
  }

  override get size(): number {
    this.#readVersion();
    return super.size;
  }

  override has(key: K): boolean {
    const exists = super.has(key);
    if (isTracking()) {
      if (exists) {
        let sig = this.#items.get(key);
        if (!sig) {
          sig = createSignal(0);
          this.#items.set(key, sig);
        }
        trackSignal(this, key as PropertyKey, sig);
      } else {
        this.#readVersion();
      }
    }
    return exists;
  }

  override get(key: K): V | undefined {
    const exists = super.has(key);
    if (isTracking()) {
      if (exists) {
        let sig = this.#items.get(key);
        if (!sig) {
          sig = createSignal(0);
          this.#items.set(key, sig);
        }
        trackSignal(this, key as PropertyKey, sig);
      } else {
        this.#readVersion();
      }
    }
    return super.get(key);
  }

  override set(key: K, value: V): this {
    if (!this.#ready) {
      return super.set(key, value);
    }
    const exists = super.has(key);
    const prev = super.get(key);
    super.set(key, value);
    if (!exists) {
      batch(() => {
        this.#bumpVersion();
        this.#bumpValuesVersion();
      });
    } else if (!Object.is(prev, value)) {
      const sig = this.#items.get(key);
      batch(() => {
        if (sig) bumpSignal(this, key as PropertyKey, sig);
        this.#bumpValuesVersion();
      });
    }
    return this;
  }

  override delete(key: K): boolean {
    if (!super.has(key)) {
      return false;
    }
    const sig = this.#items.get(key);
    this.#items.delete(key);
    const removed = super.delete(key);
    batch(() => {
      if (sig) bumpSignal(this, key as PropertyKey, sig);
      this.#bumpVersion();
      this.#bumpValuesVersion();
    });
    return removed;
  }

  override clear(): void {
    if (super.size === 0) return;
    const entries = Array.from(this.#items.entries());
    this.#items.clear();
    super.clear();
    batch(() => {
      for (const [key, sig] of entries) {
        bumpSignal(this, key as PropertyKey, sig);
      }
      this.#bumpVersion();
      this.#bumpValuesVersion();
    });
  }

  override keys(): MapIterator<K> {
    this.#readVersion();
    return super.keys();
  }

  override values(): MapIterator<V> {
    this.#readValuesVersion();
    return super.values();
  }

  override entries(): MapIterator<[K, V]> {
    this.#readValuesVersion();
    return super.entries();
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.#readValuesVersion();
    return super[Symbol.iterator]();
  }

  override forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any,
  ): void {
    this.#readValuesVersion();
    super.forEach((v, k) => callbackfn.call(thisArg, v, k, this));
  }
}

const urlLinkSymbol = Symbol("moonshine.svelte.url");
const paramsSyncSymbol = Symbol("moonshine.svelte.params.sync");

export class SvelteURLSearchParams extends URLSearchParams {
  readonly #version = createSignal(0);
  #url: SvelteURL | undefined;

  [urlLinkSymbol](url: SvelteURL): void {
    this.#url = url;
  }

  [paramsSyncSymbol](search: string): void {
    const clean = search.startsWith("?") ? search.slice(1) : search;
    if (super.toString() === clean) return;
    for (const key of Array.from(super.keys())) {
      super.delete(key);
    }
    const parsed = new URLSearchParams(clean);
    for (const [k, v] of parsed.entries()) {
      super.append(k, v);
    }
    bumpSignal(this, "searchParams", this.#version);
  }

  #read(): void {
    trackSignal(this, "searchParams", this.#version);
  }

  #mutate(fn: () => void): void {
    const before = super.toString();
    fn();
    const after = super.toString();
    if (before !== after) {
      batch(() => {
        bumpSignal(this, "searchParams", this.#version);
        if (this.#url) {
          this.#url[paramsSyncSymbol](after);
        }
      });
    }
  }

  override get size(): number {
    this.#read();
    return super.size;
  }

  override append(name: string, value: string): void {
    this.#mutate(() => super.append(name, value));
  }

  override delete(name: string, value?: string): void {
    this.#mutate(() => {
      if (arguments.length > 1) {
        super.delete(name, value);
      } else {
        super.delete(name);
      }
    });
  }

  override set(name: string, value: string): void {
    this.#mutate(() => super.set(name, value));
  }

  override sort(): void {
    this.#mutate(() => super.sort());
  }

  override get(name: string): string | null {
    this.#read();
    return super.get(name);
  }

  override getAll(name: string): string[] {
    this.#read();
    return super.getAll(name);
  }

  override has(name: string, value?: string): boolean {
    this.#read();
    return arguments.length > 1 ? super.has(name, value) : super.has(name);
  }

  override toString(): string {
    this.#read();
    return super.toString();
  }

  override keys(): URLSearchParamsIterator<string> {
    this.#read();
    return super.keys();
  }

  override values(): URLSearchParamsIterator<string> {
    this.#read();
    return super.values();
  }

  override entries(): URLSearchParamsIterator<[string, string]> {
    this.#read();
    return super.entries();
  }

  override [Symbol.iterator](): URLSearchParamsIterator<[string, string]> {
    this.#read();
    return super[Symbol.iterator]();
  }

  override forEach(
    callbackfn: (value: string, key: string, parent: URLSearchParams) => void,
    thisArg?: any,
  ): void {
    this.#read();
    super.forEach((v, k) => callbackfn.call(thisArg, v, k, this));
  }
}

export class SvelteURL extends URL {
  readonly #version = createSignal(0);
  readonly #searchParams: SvelteURLSearchParams;

  constructor(url: string | URL, base?: string | URL) {
    super(url, base);
    this.#searchParams = new SvelteURLSearchParams(super.search);
    this.#searchParams[urlLinkSymbol](this);
  }

  [paramsSyncSymbol](serialized: string): void {
    const nextSearch = serialized ? `?${serialized}` : "";
    if (super.search !== nextSearch) {
      super.search = nextSearch;
    }
    bumpSignal(this, "href", this.#version);
  }

  #read(): void {
    trackSignal(this, "href", this.#version);
  }

  #mutate(fn: () => void): void {
    const beforeHref = super.href;
    const beforeSearch = super.search;
    fn();
    if (super.href !== beforeHref) {
      batch(() => {
        if (super.search !== beforeSearch) {
          this.#searchParams[paramsSyncSymbol](super.search);
        }
        bumpSignal(this, "href", this.#version);
      });
    }
  }

  override get searchParams(): SvelteURLSearchParams {
    return this.#searchParams;
  }

  override get href(): string {
    this.#read();
    return super.href;
  }
  override set href(value: string) {
    this.#mutate(() => {
      super.href = value;
    });
  }

  override get origin(): string {
    this.#read();
    return super.origin;
  }

  override get protocol(): string {
    this.#read();
    return super.protocol;
  }
  override set protocol(value: string) {
    this.#mutate(() => {
      super.protocol = value;
    });
  }

  override get username(): string {
    this.#read();
    return super.username;
  }
  override set username(value: string) {
    this.#mutate(() => {
      super.username = value;
    });
  }

  override get password(): string {
    this.#read();
    return super.password;
  }
  override set password(value: string) {
    this.#mutate(() => {
      super.password = value;
    });
  }

  override get host(): string {
    this.#read();
    return super.host;
  }
  override set host(value: string) {
    this.#mutate(() => {
      super.host = value;
    });
  }

  override get hostname(): string {
    this.#read();
    return super.hostname;
  }
  override set hostname(value: string) {
    this.#mutate(() => {
      super.hostname = value;
    });
  }

  override get port(): string {
    this.#read();
    return super.port;
  }
  override set port(value: string) {
    this.#mutate(() => {
      super.port = value;
    });
  }

  override get pathname(): string {
    this.#read();
    return super.pathname;
  }
  override set pathname(value: string) {
    this.#mutate(() => {
      super.pathname = value;
    });
  }

  override get search(): string {
    this.#read();
    return super.search;
  }
  override set search(value: string) {
    this.#mutate(() => {
      super.search = value;
    });
  }

  override get hash(): string {
    this.#read();
    return super.hash;
  }
  override set hash(value: string) {
    this.#mutate(() => {
      super.hash = value;
    });
  }

  override toString(): string {
    this.#read();
    return super.toString();
  }

  override toJSON(): string {
    this.#read();
    return super.toJSON();
  }
}
