import { captureWatchErrorHandler, invokeWatch } from "./error-context";
/** Native composition helpers, not Vue's component or compiler runtime. */
import {
  batch,
  createComputed,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import { createMemo } from "@tschk/moonshine";
import { isTracking } from "@tschk/moonshine/tracking";
import { createTrackedSet } from "./set";
import {
  getComponentContext,
  peekComponentContext,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import {
  createMutable,
  unwrap as unwrapStore,
} from "@tschk/moonshine-dom/store";

const refs = new WeakSet<object>();
const readonlyRefs = new WeakSet<object>();
const refTriggers = new WeakMap<Ref<any>, () => void>();
const refTriggerVersions = new WeakMap<Ref<any>, number>();
declare const refBrand: unique symbol;
export class Ref<T> {
  declare readonly [refBrand]: true;
  private readonly read: () => T;
  private readonly write?: (value: T) => void;
  constructor(read: () => T, write?: (value: T) => void) {
    this.read = read;
    this.write = write;
    refs.add(this);
    if (!write) readonlyRefs.add(this);
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
export type MaybeRef<T = any> = T | Ref<T> | Readonly<Ref<T>>;
export type MaybeRefOrGetter<T = any> = MaybeRef<T> | (() => T);
function plain(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}
const proxies = new WeakMap<object, object>();
const shallowReactiveMap = new WeakMap<object, object>();
const readonlyMap = new WeakMap<object, object>();
const shallowReadonlyMap = new WeakMap<object, object>();
const targets = new WeakMap<object, object>();
const reactiveProxies = new WeakSet<object>();
const readonlyProxies = new WeakSet<object>();
const shallowProxies = new WeakSet<object>();
const rawMarked = new WeakSet<object>();

export function markRaw<T extends object>(value: T): T {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function")
  ) {
    rawMarked.add(value);
  }
  return value;
}
export function toRaw<T>(observed: T): T {
  if (observed === null || typeof observed !== "object") return observed;
  const target = targets.get(observed);
  return target ? toRaw(target as T) : observed;
}
export function isReactive(value: unknown): value is object {
  if (value === null || typeof value !== "object") return false;
  if (readonlyProxies.has(value)) {
    const target = targets.get(value);
    return target ? isReactive(target) : false;
  }
  return reactiveProxies.has(value);
}
export function isReadonly(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    (readonlyProxies.has(value) || readonlyRefs.has(value))
  );
}
export function isShallow(value: unknown): boolean {
  return (
    value !== null && typeof value === "object" && shallowProxies.has(value)
  );
}
export function isProxy(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    (reactiveProxies.has(value) || readonlyProxies.has(value))
  );
}
const arrayIndex = (key: PropertyKey) =>
  typeof key === "string" &&
  /^(0|[1-9]\d*)$/.test(key) &&
  Number(key) < 4294967295;
export type Unwrap<T> =
  T extends Readonly<Ref<infer V>>
    ? V
    : T extends Set<infer V>
      ? Set<V extends Readonly<Ref<any>> ? V : Unwrap<V>>
      : T extends ReadonlySet<infer V>
        ? ReadonlySet<V extends Readonly<Ref<any>> ? V : Unwrap<V>>
        : T extends Function | Date | Map<unknown, unknown> | Node | Window
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
export type DeepReadonly<T> = T extends
  ((...args: any[]) => any) | Date | RegExp | Node | Window
  ? T
  : T extends Readonly<Ref<infer V>>
    ? Readonly<Ref<DeepReadonly<Unwrap<V>>>>
    : T extends Set<infer V> | ReadonlySet<infer V>
      ? ReadonlySet<DeepReadonly<V>>
      : T extends Map<infer K, infer V> | ReadonlyMap<infer K, infer V>
        ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends readonly unknown[]
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : T extends object
            ? { readonly [K in keyof T]: DeepReadonly<Unwrap<T[K]>> }
            : T;
function rawValue<T>(value: T): T {
  return toRaw(value);
}
function wrapValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const raw: object = unwrapStore(value);
  if (rawMarked.has(value) || rawMarked.has(raw)) return raw as T;
  return plain(raw) || raw instanceof Set ? (reactive(value) as T) : value;
}
function wrapReadonly<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const raw: object = toRaw(value);
  if (rawMarked.has(value) || rawMarked.has(raw)) return value;
  return plain(raw) || raw instanceof Set ? (readonly(value) as T) : value;
}
export function reactive<T extends object>(value: T): Unwrap<T> {
  if (readonlyProxies.has(value)) return value as Unwrap<T>;
  const existing = proxies.get(value);
  if (existing) return existing as Unwrap<T>;
  const rawTarget = unwrapStore(value);
  if (rawMarked.has(value) || rawMarked.has(rawTarget))
    return rawTarget as Unwrap<T>;
  const cachedRaw = proxies.get(rawTarget);
  if (cachedRaw) return cachedRaw as Unwrap<T>;
  if (rawTarget instanceof Set) {
    if (!Object.isExtensible(rawTarget)) return rawTarget as Unwrap<T>;
    const proxy = createTrackedSet(rawTarget, wrapValue, rawValue);
    reactiveProxies.add(proxy);
    targets.set(proxy, rawTarget);
    proxies.set(rawTarget, proxy);
    proxies.set(proxy, proxy);
    return proxy as Unwrap<T>;
  }
  if (!plain(rawTarget))
    throw new TypeError(
      "Native reactive requires a plain object, array or Set",
    );
  if (!Object.isExtensible(rawTarget)) return rawTarget as Unwrap<T>;
  const mutable = createMutable(rawTarget, { equals: Object.is });
  const cached = proxies.get(mutable);
  if (cached) return cached as Unwrap<T>;
  const proxy = new Proxy(mutable, {
    get(target, key, receiver) {
      const next = Reflect.get(target, key, receiver);
      if (isRef(next))
        return Array.isArray(target) && arrayIndex(key) ? next : next.value;
      return wrapValue(next);
    },
    set(target, key, next) {
      if (typeof next === "object" && next !== null) next = toRaw(next);
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
  reactiveProxies.add(proxy);
  targets.set(proxy, rawTarget);
  proxies.set(rawTarget, proxy);
  proxies.set(mutable, proxy);
  proxies.set(proxy, proxy);
  return proxy as Unwrap<T>;
}

type ShallowCell = ReturnType<typeof createSignal<number>>;
type ShallowState = {
  reads: Map<PropertyKey, ShallowCell>;
  has: Map<PropertyKey, ShallowCell>;
  keys?: ShallowCell;
};
const shallowStates = new WeakMap<object, ShallowState>();
const shallowArrayMutations = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);
function getShallowState(target: object): ShallowState {
  let node = shallowStates.get(target);
  if (!node) {
    node = { reads: new Map(), has: new Map() };
    shallowStates.set(target, node);
  }
  return node;
}
function trackShallow(
  map: Map<PropertyKey, ShallowCell>,
  key: PropertyKey,
): void {
  if (!isTracking()) return;
  let cell = map.get(key);
  if (!cell) map.set(key, (cell = createSignal(0, { equals: false })));
  cell[0]();
}
function notifyShallow(cell: ShallowCell | undefined): void {
  cell?.[1]((version) => version + 1);
}

export function shallowReactive<T extends object>(value: T): T {
  if (readonlyProxies.has(value)) return value;
  if (shallowProxies.has(value) && reactiveProxies.has(value)) return value;
  const rawTarget = toRaw(value);
  if (
    rawMarked.has(value) ||
    rawMarked.has(rawTarget) ||
    !Object.isExtensible(rawTarget)
  )
    return rawTarget;
  const existing = shallowReactiveMap.get(rawTarget);
  if (existing) return existing as T;
  if (rawTarget instanceof Set) {
    const proxy = createTrackedSet(rawTarget, (v) => v, rawValue);
    reactiveProxies.add(proxy);
    shallowProxies.add(proxy);
    targets.set(proxy, rawTarget);
    shallowReactiveMap.set(rawTarget, proxy);
    shallowReactiveMap.set(proxy, proxy);
    return proxy as unknown as T;
  }
  if (!plain(rawTarget))
    throw new TypeError(
      "Native shallowReactive requires a plain object, array or Set",
    );
  const methods = new Map<PropertyKey, Function>();
  const proxy = new Proxy(rawTarget, {
    get(target, key, receiver) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (
        !descriptor?.get &&
        (Object.hasOwn(target, key) ||
          typeof (target as Record<PropertyKey, unknown>)[key] !== "function")
      ) {
        trackShallow(getShallowState(target).reads, key);
      }
      const result = Reflect.get(target, key, receiver);
      if (
        Array.isArray(target) &&
        typeof key === "string" &&
        shallowArrayMutations.has(key) &&
        result === Reflect.get(Array.prototype, key)
      ) {
        let method = methods.get(key);
        if (!method) {
          method = function (this: unknown, ...args: unknown[]) {
            return batch(() =>
              untrack(() => Reflect.apply(result as Function, this, args)),
            );
          };
          methods.set(key, method);
        }
        return method;
      }
      return result;
    },
    has(target, key) {
      trackShallow(getShallowState(target).has, key);
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      if (isTracking()) {
        const node = getShallowState(target);
        if (Array.isArray(target)) trackShallow(node.reads, "length");
        else (node.keys ??= createSignal(0, { equals: false }))[0]();
      }
      return Reflect.ownKeys(target);
    },
    set(target, key, next, receiver) {
      return batch(() =>
        untrack(() => {
          const isArray = Array.isArray(target);
          const prevLength = isArray ? target.length : 0;
          const hadKey = Object.hasOwn(target, key);
          const previous = (target as Record<PropertyKey, unknown>)[key];
          const ok = Reflect.set(target, key, next, receiver);
          if (!ok) return false;
          const node = shallowStates.get(target);
          if (!node) return true;
          if (!hadKey) {
            notifyShallow(node.reads.get(key));
            notifyShallow(node.has.get(key));
            notifyShallow(node.keys);
            if (isArray && target.length !== prevLength) {
              notifyShallow(node.reads.get("length"));
            }
          } else if (!Object.is(previous, next)) {
            notifyShallow(node.reads.get(key));
            if (isArray) {
              if (key === "length" && target.length < prevLength) {
                for (let i = target.length; i < prevLength; i++) {
                  const idxKey = String(i);
                  notifyShallow(node.reads.get(idxKey));
                  notifyShallow(node.has.get(idxKey));
                }
                notifyShallow(node.keys);
              } else if (key !== "length" && target.length !== prevLength) {
                notifyShallow(node.reads.get("length"));
              }
            }
          }
          return true;
        }),
      );
    },
    deleteProperty(target, key) {
      return batch(() =>
        untrack(() => {
          const hadKey = Object.hasOwn(target, key);
          const ok = Reflect.deleteProperty(target, key);
          if (ok && hadKey) {
            const node = shallowStates.get(target);
            if (node) {
              notifyShallow(node.reads.get(key));
              notifyShallow(node.has.get(key));
              notifyShallow(node.keys);
            }
          }
          return ok;
        }),
      );
    },
  });
  reactiveProxies.add(proxy);
  shallowProxies.add(proxy);
  targets.set(proxy, rawTarget);
  shallowReactiveMap.set(rawTarget, proxy);
  shallowReactiveMap.set(proxy, proxy);
  return proxy as T;
}

const readonlySetStates = new WeakMap<
  object,
  { target: Set<unknown>; deep: boolean }
>();
function readonlySetState(value: object) {
  const found = readonlySetStates.get(value);
  if (!found) throw new TypeError("Set method requires a native readonly Set");
  return found;
}
function readonlySetIterator(
  receiver: Set<unknown>,
  entries: boolean,
): SetIterator<any> {
  const s = readonlySetState(receiver);
  return (function* () {
    for (const value of s.target) {
      const wrapped = s.deep ? wrapReadonly(value) : value;
      yield entries ? [wrapped, wrapped] : wrapped;
    }
    return undefined;
  })();
}
const readonlySetMethods = {
  get size() {
    return readonlySetState(this).target.size;
  },
  has(this: Set<unknown>, key: unknown) {
    const { target } = readonlySetState(this);
    const raw = toRaw(key);
    return target.has(key) || target.has(raw);
  },
  add() {
    throw new TypeError("Cannot mutate a readonly Set");
  },
  delete() {
    throw new TypeError("Cannot mutate a readonly Set");
  },
  clear() {
    throw new TypeError("Cannot mutate a readonly Set");
  },
  keys(this: Set<unknown>) {
    return readonlySetIterator(this, false);
  },
  values(this: Set<unknown>) {
    return readonlySetIterator(this, false);
  },
  entries(this: Set<unknown>) {
    return readonlySetIterator(this, true);
  },
  [Symbol.iterator](this: Set<unknown>) {
    return readonlySetIterator(this, false);
  },
  forEach(
    this: Set<unknown>,
    callback: (value: unknown, key: unknown, set: Set<unknown>) => void,
    thisArg?: unknown,
  ) {
    if (typeof callback !== "function")
      throw new TypeError("Set callback must be a function");
    const s = readonlySetState(this);
    s.target.forEach((value) => {
      const wrapped = s.deep ? wrapReadonly(value) : value;
      callback.call(thisArg, wrapped, wrapped, this);
    });
  },
};
function createReadonlySet(target: Set<unknown>, deep: boolean): Set<unknown> {
  const proxy = new Proxy(target, {
    get(source, key, receiver) {
      return Object.hasOwn(readonlySetMethods, key) && key in source
        ? Reflect.get(readonlySetMethods, key, receiver)
        : Reflect.get(source, key, receiver);
    },
  });
  readonlySetStates.set(proxy, { target, deep });
  return proxy;
}

function createReadonly<T extends object>(value: T, shallow: boolean): any {
  if (isRef(value)) {
    if (readonlyRefs.has(value) && (!shallow || shallowProxies.has(value))) {
      return value;
    }
    const cache = shallow ? shallowReadonlyMap : readonlyMap;
    const cachedRef = cache.get(value);
    if (cachedRef) return cachedRef;
    const roRef = new Ref(() =>
      shallow ? value.value : wrapReadonly(value.value),
    );
    if (shallow) shallowProxies.add(roRef);
    targets.set(roRef, value);
    cache.set(value, roRef);
    return roRef;
  }
  if (!shallow && readonlyProxies.has(value) && !shallowProxies.has(value)) {
    return value;
  }
  if (shallow && readonlyProxies.has(value) && shallowProxies.has(value)) {
    return value;
  }
  const underlying = readonlyProxies.has(value)
    ? ((targets.get(value) as T) ?? value)
    : value;
  const rawCandidate = toRaw(underlying);
  if (
    rawMarked.has(value) ||
    rawMarked.has(underlying) ||
    rawMarked.has(rawCandidate) ||
    !Object.isExtensible(rawCandidate)
  ) {
    return value;
  }
  const cache = shallow ? shallowReadonlyMap : readonlyMap;
  const existing = cache.get(underlying);
  if (existing) return existing;
  if (rawCandidate instanceof Set) {
    const proxy = createReadonlySet(
      underlying as unknown as Set<unknown>,
      !shallow,
    );
    readonlyProxies.add(proxy);
    if (shallow) shallowProxies.add(proxy);
    targets.set(proxy, underlying);
    cache.set(underlying, proxy);
    cache.set(proxy, proxy);
    return proxy;
  }
  if (!plain(rawCandidate))
    throw new TypeError(
      "Native readonly requires a plain object, array or Set",
    );
  const proxy = new Proxy(underlying, {
    get(target, key, receiver) {
      const next = Reflect.get(target, key, receiver);
      if (shallow) return next;
      if (isRef(next)) {
        return Array.isArray(target) && arrayIndex(key)
          ? readonly(next)
          : wrapReadonly(next.value);
      }
      return wrapReadonly(next);
    },
    set(_target, key) {
      throw new TypeError(
        `Cannot assign to read only property '${String(key)}'`,
      );
    },
    deleteProperty(_target, key) {
      throw new TypeError(
        `Cannot delete property '${String(key)}' of a readonly object`,
      );
    },
    defineProperty(_target, key) {
      throw new TypeError(
        `Cannot define property '${String(key)}' on a readonly object`,
      );
    },
  });
  readonlyProxies.add(proxy);
  if (shallow) shallowProxies.add(proxy);
  targets.set(proxy, underlying);
  cache.set(underlying, proxy);
  cache.set(proxy, proxy);
  return proxy;
}

export function readonly<T extends object>(value: T): DeepReadonly<T> {
  return createReadonly(value, false);
}
export function shallowReadonly<T extends object>(value: T): Readonly<T> {
  return createReadonly(value, true);
}

export function ref<T>(value: Ref<T>): Ref<T>;
export function ref<T>(value: T): Ref<Unwrap<T>>;
export function ref<T = any>(): Ref<T | undefined>;
export function ref<T>(value?: T | Ref<T>): Ref<any> {
  if (isRef(value)) return value;
  const convert = wrapValue<T>;
  let forceTrigger = false;
  const [read, write] = createSignal(convert(value as T), {
    equals: (prev, next) => !forceTrigger && Object.is(prev, next),
  });
  const refObject = new Ref(read, (next) => write(() => convert(next)));
  refTriggers.set(refObject, () => {
    forceTrigger = true;
    try {
      refTriggerVersions.set(
        refObject,
        (refTriggerVersions.get(refObject) ?? 0) + 1,
      );
      write((current) => current);
    } finally {
      forceTrigger = false;
    }
  });
  return refObject;
}
/** Keep external snapshots intact; only replacing .value or triggerRef notifies this ref. */
export function shallowRef<T extends Readonly<Ref<any>>>(value: T): T;
export function shallowRef<T>(value: T): Ref<T>;
export function shallowRef<T = any>(): Ref<T | undefined>;
export function shallowRef(value?: unknown): Ref<any> {
  if (isRef(value)) return value;
  let forceTrigger = false;
  const [read, write] = createSignal<unknown>(value, {
    equals: (prev, next) => !forceTrigger && Object.is(prev, next),
  });
  const refObject = new Ref(read, (next) => write(() => next));
  shallowProxies.add(refObject);
  refTriggers.set(refObject, () => {
    forceTrigger = true;
    try {
      refTriggerVersions.set(
        refObject,
        (refTriggerVersions.get(refObject) ?? 0) + 1,
      );
      write((current: unknown) => current);
    } finally {
      forceTrigger = false;
    }
  });
  return refObject;
}
export function triggerRef(target: Readonly<Ref<any>>): void {
  if (!isRef(target)) throw new TypeError("triggerRef requires a native ref");
  refTriggers.get(target)?.();
}
export type CustomRefFactory<T> = (
  track: () => void,
  trigger: () => void,
) => {
  get: () => T;
  set: (value: T) => void;
};
export function customRef<T>(factory: CustomRefFactory<T>): Ref<T> {
  if (typeof factory !== "function")
    throw new TypeError("customRef requires a factory function");
  const [readVersion, writeVersion] = createSignal(0, { equals: false });
  let refObject!: Ref<T>;
  const track = () => {
    readVersion();
  };
  const trigger = () => {
    refTriggerVersions.set(
      refObject,
      (refTriggerVersions.get(refObject) ?? 0) + 1,
    );
    writeVersion((v) => v + 1);
  };
  const { get, set } = factory(track, trigger);
  if (typeof get !== "function" || typeof set !== "function")
    throw new TypeError("customRef factory must return get and set functions");
  refObject = new Ref(
    () => get(),
    (value) => set(value),
  );
  refTriggers.set(refObject, trigger);
  return refObject;
}
/** Unwrap native refs without invoking ordinary function values. */
export function unref<T>(value: T): T extends Readonly<Ref<infer V>> ? V : T;
export function unref(value: unknown): unknown {
  return isRef(value) ? value.value : value;
}
/** Normalize values, refs, and zero-arg getters to their underlying value. */
export function toValue<T>(source: MaybeRefOrGetter<T>): T;
export function toValue(source: unknown): unknown {
  return typeof source === "function" ? source() : unref(source);
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
    let previousVersions: number[] | undefined;
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
      const versions = sources.map((item) =>
        isRef(item) ? (refTriggerVersions.get(item) ?? 0) : 0,
      );
      if (
        previous &&
        values.every(
          (value, i) =>
            Object.is(value, previous![i]) &&
            versions[i] === previousVersions![i],
        )
      )
        return;
      const old = previous;
      previous = values;
      previousVersions = versions;
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

let activeEffectScope: EffectScope | undefined;
const componentScopes = new WeakMap<ComponentContext, EffectScope>();
const scopeCleanups = new WeakMap<EffectScope, Array<() => void>>();

function runEffectScope<T>(
  scope: EffectScope,
  scopeOwner: Owner,
  fn: () => T,
): T {
  const prev = activeEffectScope;
  activeEffectScope = scope;
  try {
    return runWithOwner(scopeOwner, fn);
  } finally {
    activeEffectScope = prev;
  }
}

export class EffectScope {
  private isActive = true;
  private readonly owner: Owner;
  private readonly disposeOwner: () => void;
  private readonly scopes: Set<EffectScope> = new Set();
  private readonly parent?: EffectScope;

  constructor(detached = false) {
    let disposeOwner!: () => void;
    let scopeOwner!: Owner;
    createRoot((dispose) => {
      disposeOwner = dispose;
      scopeOwner = getOwner()!;
    });
    this.disposeOwner = disposeOwner;
    this.owner = scopeOwner;
    scopeCleanups.set(this, []);
    if (!detached) {
      const parent = getCurrentScope();
      if (parent && parent.active) {
        this.parent = parent;
        parent.scopes.add(this);
      } else {
        const outer = getOwner();
        if (outer && !outer.disposed) {
          onCleanup(() => this.stop(true));
        }
      }
    }
  }

  get active(): boolean {
    return this.isActive;
  }

  run<T>(fn: () => T): T | undefined {
    if (!this.isActive) return undefined;
    return runEffectScope(this, this.owner, fn);
  }

  stop(fromParent = false): void {
    if (!this.isActive) return;
    this.isActive = false;
    let failed = false;
    let failure: unknown;
    try {
      this.disposeOwner();
    } catch (error) {
      failed = true;
      failure = error;
    }
    for (const child of Array.from(this.scopes)) {
      this.scopes.delete(child);
      try {
        child.stop(true);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    const cleanups = scopeCleanups.get(this);
    if (cleanups) {
      for (const cleanup of cleanups.splice(0)) {
        try {
          untrack(cleanup);
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }
    if (!fromParent && this.parent) {
      this.parent.scopes.delete(this);
    }
    if (failed) throw failure;
  }
}

export function effectScope(detached?: boolean): EffectScope {
  return new EffectScope(detached);
}

export function getCurrentScope(): EffectScope | undefined {
  if (activeEffectScope) {
    return activeEffectScope.active ? activeEffectScope : undefined;
  }
  const frame = peekComponentContext();
  if (frame?.active && !frame.owner.disposed) {
    let scope = componentScopes.get(frame);
    if (!scope) {
      scope = new EffectScope(true);
      componentScopes.set(frame, scope);
      runWithOwner(frame.owner, () => {
        onCleanup(() => scope!.stop(true));
      });
    }
    return scope.active ? scope : undefined;
  }
  return undefined;
}

export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (typeof fn !== "function")
    throw new TypeError("onScopeDispose callback must be a function");
  const scope = getCurrentScope();
  if (scope) {
    scopeCleanups.get(scope)?.push(fn);
  } else if (!failSilently) {
    throw new Error("onScopeDispose requires an active effectScope");
  }
}

export type TemplateRef<T = unknown> = Readonly<Ref<T | null>>;

const templateRefBindings = new WeakMap<
  Ref<any>,
  {
    get: () => any;
    set: (value: any) => void;
  }
>();
const componentTemplateRefKeys = new WeakMap<ComponentContext, Set<string>>();

/** Internal binder lookup for readonly useTemplateRef instances. */
export function getTemplateRefBinding<T>(target: Readonly<Ref<T | null>>):
  | {
      get: () => T | null | undefined;
      set: (value: T | null) => void;
    }
  | undefined {
  return templateRefBindings.get(target as Ref<any>);
}

/** Native component template ref; readonly to user code, bound by template ref wave. */
export function useTemplateRef<T = unknown, K extends string = string>(
  key: K,
): TemplateRef<T> {
  const frame = getComponentContext();
  if (typeof key !== "string" || key.length === 0)
    throw new TypeError("Template ref key must be a non-empty string");
  let keys = componentTemplateRefKeys.get(frame);
  if (!keys) {
    keys = new Set();
    componentTemplateRefKeys.set(frame, keys);
  }
  if (keys.has(key))
    throw new Error(`useTemplateRef(${JSON.stringify(key)}) already exists`);
  keys.add(key);
  if (frame.mode === "ssr") return new Ref<T | null>(() => null);
  const [read, write] = createSignal<T | null>(null, { equals: Object.is });
  const refObject = new Ref<T | null>(read);
  templateRefBindings.set(refObject, { get: read, set: write });
  return refObject;
}
