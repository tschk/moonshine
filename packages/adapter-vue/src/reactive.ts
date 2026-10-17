import { captureWatchErrorHandler, invokeWatch } from "./error-context";
/** Native composition helpers, not Vue's component or compiler runtime. */
import {
  batch,
  createComputed,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { createMemo } from "@tschk/moonshine";
import { createMutable } from "@tschk/moonshine-dom/store";

const refs = new WeakSet<object>();
declare const refBrand: unique symbol;
export class Ref<T> {
  declare readonly [refBrand]: true;
  private readonly read: () => T;
  private readonly write?: (value: T) => void;
  constructor(read: () => T, write?: (value: T) => void) {
    this.read = read;
    this.write = write;
    refs.add(this);
  }
  get value(): T {
    return this.read();
  }
  set value(value: T) {
    if (!this.write) throw new TypeError("Native ref is readonly");
    this.write(value);
  }
}
export function isRef(value: unknown): value is Ref<any> {
  return typeof value === "object" && value !== null && refs.has(value);
}
function plain(value: unknown): value is object {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}
const proxies = new WeakMap<object, object>();
const targets = new WeakMap<object, object>();
export function isReactive(value: unknown): value is object {
  return value !== null && typeof value === "object" && targets.has(value);
}
const arrayIndex = (key: PropertyKey) =>
  typeof key === "string" &&
  /^(0|[1-9]\d*)$/.test(key) &&
  Number(key) < 4294967295;
export type Unwrap<T> =
  T extends Readonly<Ref<infer V>>
    ? V
    : T extends Function | Date | Map<unknown, unknown> | Set<unknown>
      ? T
      : T extends readonly unknown[]
        ? {
            [K in keyof T]: T[K] extends Readonly<Ref<any>>
              ? T[K]
              : Unwrap<T[K]>;
          }
        : T extends object
          ? { [K in keyof T]: Unwrap<T[K]> }
          : T;
export function reactive<T extends object>(value: T): Unwrap<T> {
  if (!plain(value))
    throw new TypeError("Native reactive requires a plain object or array");
  const existing = proxies.get(value);
  if (existing) return existing as Unwrap<T>;
  const mutable = createMutable(value, { equals: Object.is });
  const cached = proxies.get(mutable);
  if (cached) return cached as Unwrap<T>;
  const proxy = new Proxy(mutable, {
    get(target, key, receiver) {
      const next = Reflect.get(target, key, receiver);
      if (isRef(next))
        return Array.isArray(target) && arrayIndex(key) ? next : next.value;
      return plain(next) ? reactive(next) : next;
    },
    set(target, key, next) {
      if (typeof next === "object" && next !== null)
        next = targets.get(next) ?? next;
      return batch(() =>
        untrack(() => {
          const previous = Reflect.get(target, key);
          if (
            !(Array.isArray(target) && arrayIndex(key)) &&
            isRef(previous) &&
            !isRef(next)
          )
            previous.value = next;
          else Reflect.set(target, key, next);
          return true;
        }),
      );
    },
  });
  targets.set(proxy, mutable);
  proxies.set(mutable, proxy);
  proxies.set(proxy, proxy);
  return proxy as Unwrap<T>;
}
export function ref<T>(value: Ref<T>): Ref<T>;
export function ref<T>(value: T): Ref<Unwrap<T>>;
export function ref<T>(value: T | Ref<T>): Ref<any> {
  if (isRef(value)) return value;
  const convert = (next: T): T => (plain(next) ? (reactive(next) as T) : next);
  const [read, write] = createSignal(convert(value as T), {
    equals: Object.is,
  });
  return new Ref(read, (next) => write(() => convert(next)));
}
/** Keep external snapshots intact; only replacing .value notifies this ref. */
export function shallowRef<T extends Readonly<Ref<any>>>(value: T): T;
export function shallowRef<T>(value: T): Ref<T>;
export function shallowRef<T = any>(): Ref<T | undefined>;
export function shallowRef(value?: unknown): Ref<any> {
  if (isRef(value)) return value;
  const [read, write] = createSignal(value, { equals: Object.is });
  return new Ref(read, (next) => write(() => next));
}
/** Unwrap native refs without invoking ordinary function values. */
export function unref<T>(value: T): T extends Readonly<Ref<infer V>> ? V : T;
export function unref(value: unknown): unknown {
  return isRef(value) ? value.value : value;
}
export type ToRef<T> = [T] extends [Readonly<Ref<any>>] ? T : Ref<T>;
export function toRef<T extends Readonly<Ref<any>>>(value: T): T;
export function toRef<T>(getter: () => T): Readonly<Ref<T>>;
export function toRef<T>(value: T): Ref<Unwrap<T>>;
export function toRef(): Ref<undefined>;
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
): ToRef<T[K]>;
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
  defaultValue: T[K],
): ToRef<Exclude<T[K], undefined>>;
export function toRef(
  source?: unknown,
  key?: PropertyKey,
  defaultValue?: unknown,
): Ref<any> {
  if (isRef(source)) return source;
  if (typeof source === "function") return new Ref(() => source());
  if (source !== null && typeof source === "object" && arguments.length > 1) {
    const object = source as Record<PropertyKey, unknown>;
    const current = object[key!];
    if (isRef(current)) return current;
    return new Ref(
      () => {
        const value = object[key!];
        return value === undefined ? defaultValue : value;
      },
      (value) => {
        object[key!] = value;
      },
    );
  }
  return ref(source);
}
/** Link the currently enumerable string properties, preserving array holes. */
export type ToRefs<T = any> = { [K in keyof T]: ToRef<T[K]> };
export function toRefs<T extends object>(object: T): ToRefs<T> {
  const result =
    // Preserve sparse holes; Array.from would materialize undefined entries.
    // eslint-disable-next-line unicorn/no-new-array
    (Array.isArray(object) ? new Array(object.length) : {}) as ToRefs<T>;
  for (const key in object) {
    Object.defineProperty(result, key, {
      value: toRef(object, key),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}
export function computed<T>(
  getter: (previous: T | undefined) => T,
): Readonly<Ref<T>>;
export function computed<T>(options: {
  get: (previous: T | undefined) => T;
  set: (value: T) => void;
}): Ref<T>;
export function computed<T>(
  input:
    | ((previous: T | undefined) => T)
    | { get: (previous: T | undefined) => T; set: (value: T) => void },
): Ref<T> {
  const getter = typeof input === "function" ? input : input.get;
  let previous: T | undefined;
  const read = createMemo(() => {
    const next = getter(previous);
    previous = next;
    return next;
  });
  return new Ref(
    read,
    typeof input === "function"
      ? undefined
      : (value) => batch(() => untrack(() => input.set(value))),
  );
}
export type WatchSource<T = unknown> = Readonly<Ref<T>> | (() => T);
export type WatchOptions = { flush: "sync"; immediate?: boolean };
export function watch<T>(
  source: WatchSource<T>,
  callback: (
    value: T,
    previous: T | undefined,
    onCleanup: (fn: () => void) => void,
  ) => void,
  options: WatchOptions,
): () => void;
export function watch<T extends readonly unknown[]>(
  source: { [K in keyof T]: WatchSource<T[K]> },
  callback: (
    value: T,
    previous: T | undefined,
    onCleanup: (fn: () => void) => void,
  ) => void,
  options: WatchOptions,
): () => void;
export function watch(
  source: WatchSource<any> | readonly WatchSource<any>[],
  callback: (
    value: any,
    previous: any,
    onCleanup: (fn: () => void) => void,
  ) => void,
  options: WatchOptions,
): () => void {
  if (
    !options ||
    options.flush !== "sync" ||
    Object.keys(options).some((key) => key !== "flush" && key !== "immediate")
  )
    throw new TypeError(
      "Native watch supports only flush:'sync' and immediate",
    );
  const sources = Array.isArray(source) ? source : [source];
  if (sources.some((item) => !isRef(item) && typeof item !== "function"))
    throw new TypeError("Native watch requires refs or getters");
  const outer = getOwner();
  if (outer?.disposed)
    throw new Error("Cannot watch from a disposed native owner");
  const reportError = captureWatchErrorHandler();
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    let previous: any[] | undefined;
    let reading = false;
    const cleanups: Array<() => void> = [];
    let active = true;
    const clean = () => {
      let failed = false;
      let failure: unknown;
      for (const fn of cleanups.splice(0)) {
        try {
          untrack(() =>
            reportError ? invokeWatch(reportError, "watch cleanup", fn) : fn(),
          );
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
      if (failed) throw failure;
    };
    onCleanup(() => {
      active = false;
      clean();
    });
    createComputed(() => {
      // Getter reporting may write its source; callback feedback remains reentrant.
      if (reportError && reading) return;
      let values: any[];
      reading = true;
      try {
        values = sources.map((item) =>
          isRef(item)
            ? item.value
            : reportError
              ? invokeWatch(reportError, "watch getter", item)
              : item(),
        );
      } finally {
        reading = false;
      }
      if (
        previous &&
        values.every((value, i) => Object.is(value, previous![i]))
      )
        return;
      const old = previous;
      previous = values;
      if (!old && !options.immediate) return;
      untrack(() => {
        clean();
        if (!active) return;
        const invoke = () =>
          callback(
            Array.isArray(source) ? values : values[0],
            Array.isArray(source) ? old : old?.[0],
            (fn) => {
              if (typeof fn !== "function")
                throw new TypeError("Watcher cleanup must be a function");
              if (active) cleanups.push(fn);
              else if (reportError)
                invokeWatch(reportError, "watch cleanup", fn);
              else fn();
            },
          );
        if (reportError) invokeWatch(reportError, "watch callback", invoke);
        else invoke();
      });
    });
  });
  if (outer) onCleanup(stop);
  return stop;
}

/** Synchronously track an owned effect; no component render scheduler is implied. */
export function watchSyncEffect(
  effect: (onCleanup: (fn: () => void) => void) => void,
): () => void {
  if (typeof effect !== "function")
    throw new TypeError("Watcher effect must be a function");
  const outer = getOwner();
  if (outer?.disposed)
    throw new Error("Cannot watch from a disposed native owner");
  const reportError = captureWatchErrorHandler();
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    let active = true;
    let running = false;
    const cleanups: Array<() => void> = [];
    const clean = () => {
      let failed = false;
      let failure: unknown;
      for (const fn of cleanups.splice(0)) {
        try {
          untrack(() =>
            reportError ? invokeWatch(reportError, "watch cleanup", fn) : fn(),
          );
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
      if (failed) throw failure;
    };
    onCleanup(() => {
      active = false;
      clean();
    });
    createComputed(() => {
      if (running || !active) return;
      running = true;
      try {
        untrack(clean);
        if (!active) return;
        const invoke = () =>
          effect((fn) => {
            if (typeof fn !== "function")
              throw new TypeError("Watcher cleanup must be a function");
            if (active) cleanups.push(fn);
          });
        if (reportError) invokeWatch(reportError, "watch effect", invoke);
        else invoke();
      } catch (error) {
        if (!reportError)
          try {
            untrack(clean);
          } catch {
            /* Preserve the effect failure. */
          }
        throw error;
      } finally {
        running = false;
      }
    });
  });
  if (outer) onCleanup(stop);
  return stop;
}
