/** Independent structured state; shares only Moonshine's reactive graph. */
import { batch, createSignal, untrack } from "./reactive";

type Key = string | number | symbol;
export type StorePathRange = { from?: number; to?: number; by?: number };
type Range = StorePathRange;
type Selector =
  Key | readonly Key[] | Range | ((value: any, index: number) => boolean);
export type Store<T> = T;
export type NotWrappable =
  string | number | bigint | symbol | boolean | Function | null | undefined;
export type StoreSetter<T, U extends PropertyKey[] = []> =
  T | Partial<T> | ((prevState: T, traversed: U) => T | Partial<T> | void);
export interface ReconcileOptions {
  key?: string | null;
  merge?: boolean;
}
export const $RAW: unique symbol = Symbol("store-raw");
export const DEV: { readonly $RAW: typeof $RAW } | undefined = Object.freeze({
  $RAW,
});
type Update<T> =
  T | Partial<T> | ((previous: T, path: Key[]) => T | Partial<T> | void);
export interface SetStoreFunction<T> {
  (value: Update<T>): void;
  <K extends keyof T>(key: K, value: Update<T[K]>): void;
  (...path: [...Selector[], unknown]): void;
}
type Cell = ReturnType<typeof createSignal<number>>;
type State = {
  reads: Map<PropertyKey, Cell>;
  has: Map<PropertyKey, Cell>;
  keys?: Cell;
};
const states = new WeakMap<object, State>();
const readonlyProxies = new WeakMap<object, object>();
const drafts = new WeakMap<object, object>();
const mutableProxies = new WeakMap<object, object>();
type Equality = (previous: unknown, next: unknown) => boolean;
const strictEqual: Equality = (previous, next) => previous === next;
const mutableEqualities = new WeakMap<Equality, WeakMap<object, object>>();
const arrayMutations = new Set([
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
const rawValues = new WeakMap<object, object>();
const unsafe = (key: PropertyKey) =>
  key === "__proto__" || key === "constructor" || key === "prototype";
function raw<T>(value: T): T {
  return (
    value !== null && typeof value === "object"
      ? (rawValues.get(value) ?? value)
      : value
  ) as T;
}
/** Return raw stores and unwrap embedded proxies; direct raw writes bypass tracking. */
export function unwrap<T>(value: T): T {
  const initial = raw(value);
  if (initial !== value || !wrappable(value)) return initial;
  const seen = new WeakMap<object, unknown>();
  function visit(item: unknown): unknown {
    const target = raw(item);
    if (target !== item || !wrappable(item)) return target;
    if (seen.has(item)) return seen.get(item);
    const result: Record<PropertyKey, any> = Object.isFrozen(item)
      ? Array.isArray(item)
        ? item.slice()
        : { ...item }
      : item;
    seen.set(item, result);
    const replace = (key: string | number) => {
      const previous = result[key];
      const next = visit(previous);
      if (next !== previous) result[key] = next;
    };
    if (Array.isArray(result)) {
      for (let index = 0; index < result.length; index++) replace(index);
    } else {
      for (const key of Object.keys(result))
        if (!Object.getOwnPropertyDescriptor(result, key)?.get) replace(key);
    }
    return result;
  }
  return visit(value) as T;
}

function wrappable(value: unknown): value is Record<PropertyKey, any> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    Array.isArray(value) || prototype === Object.prototype || prototype === null
  );
}
function state(target: object): State {
  let node = states.get(target);
  if (!node) states.set(target, (node = { reads: new Map(), has: new Map() }));
  return node;
}
function track(map: Map<PropertyKey, Cell>, key: PropertyKey): void {
  let cell = map.get(key);
  if (!cell) map.set(key, (cell = createSignal(0, { equals: false })));
  cell[0]();
}
function notify(cell: Cell | undefined): void {
  cell?.[1]((version) => version + 1);
}
function write(
  target: Record<PropertyKey, any>,
  key: PropertyKey,
  value: unknown,
  assignment = false,
  equals: Equality = strictEqual,
): void {
  if (unsafe(key)) throw new TypeError(`Unsafe store path: ${String(key)}`);
  value = raw(value);
  const previous = target[key],
    had = key in target,
    own = Object.hasOwn(target, key);
  const deleting = value === undefined && !assignment;
  const setter = Object.getOwnPropertyDescriptor(target, key)?.set;
  if (!deleting && own && equals(previous, value) && !(assignment && setter))
    return;
  if (deleting && !own) return;
  const length = Array.isArray(target) ? target.length : undefined;
  if (
    !(deleting
      ? Reflect.deleteProperty(target, key)
      : Reflect.set(
          target,
          key,
          value,
          setter
            ? wrap(target, assignment ? "mutable" : "draft", equals)
            : target,
        ))
  )
    throw new TypeError(`Cannot update store property: ${String(key)}`);
  const node = states.get(target);
  if (!node) return;
  notify(node.reads.get(key));
  if (had !== key in target) notify(node.has.get(key));
  if (length !== undefined && target.length !== length) {
    for (const [property, cell] of node.reads) {
      if (
        typeof property === "string" &&
        /^(0|[1-9]\d*)$/.test(property) &&
        Number(property) >= target.length &&
        Number(property) < length
      )
        notify(cell);
    }
    for (const [property, cell] of node.has) {
      if (
        typeof property === "string" &&
        /^(0|[1-9]\d*)$/.test(property) &&
        Number(property) >= target.length &&
        Number(property) < length
      )
        notify(cell);
    }
    if (key !== "length") notify(node.reads.get("length"));
  }
  notify(node.keys);
}
function wrap<T>(
  value: T,
  mode: "readonly" | "draft" | "mutable" = "readonly",
  equals: Equality = strictEqual,
): T {
  const writable = mode !== "readonly";
  const tracked = mode !== "draft";
  value = raw(value);
  if (!wrappable(value)) return value;
  if (!Object.isExtensible(value))
    throw new TypeError("Store objects must be extensible");
  let cache =
    mode === "draft"
      ? drafts
      : mode === "mutable"
        ? mutableProxies
        : readonlyProxies;
  if (mode === "mutable" && equals !== strictEqual) {
    let custom = mutableEqualities.get(equals);
    if (!custom) mutableEqualities.set(equals, (custom = new WeakMap()));
    cache = custom;
  }
  const cached = cache.get(value);
  if (cached) return cached as T;
  const methods = new Map<PropertyKey, Function>();
  const proxy: object = new Proxy(value, {
    get(target, key, receiver) {
      if (key === $RAW) return target;
      // Undefined constructor selects ordinary arrays without exposing prototypes.
      if (writable && key === "constructor" && Array.isArray(target))
        return undefined;
      if (writable && unsafe(key))
        throw new TypeError(`Unsafe store ${mode} access: ${String(key)}`);
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (
        tracked &&
        !descriptor?.get &&
        (Object.hasOwn(target, key) || typeof target[key] !== "function")
      )
        track(state(target).reads, key);
      const result = Reflect.get(target, key, receiver);
      if (
        mode === "mutable" &&
        Array.isArray(target) &&
        typeof key === "string" &&
        arrayMutations.has(key) &&
        result === Reflect.get(Array.prototype, key)
      ) {
        let method = methods.get(key);
        if (!method) {
          method = function (this: unknown, ...args: unknown[]) {
            return batch(() =>
              untrack(() => Reflect.apply(result, this, args)),
            );
          };
          methods.set(key, method);
        }
        return method;
      }
      return wrap(result, mode, equals);
    },
    has(target, key) {
      if (key === $RAW) return true;
      if (tracked) track(state(target).has, key);
      return key in target;
    },
    ownKeys(target) {
      if (tracked) {
        const node = state(target);
        (node.keys ??= createSignal(0, { equals: false }))[0]();
      }
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (
        !descriptor ||
        !descriptor.configurable ||
        descriptor.get ||
        descriptor.set
      )
        return descriptor;
      return {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: () => Reflect.get(proxy, key),
      };
    },
    set(target, key, next) {
      if (mode === "mutable")
        batch(() => untrack(() => write(target, key, next, true, equals)));
      else if (writable) write(target, key, next);
      return true;
    },
    deleteProperty(target, key) {
      if (mode === "mutable")
        batch(() =>
          untrack(() => write(target, key, undefined, false, equals)),
        );
      else if (writable) write(target, key, undefined);
      return true;
    },
    defineProperty() {
      throw new TypeError("Store property descriptors cannot be changed");
    },
    setPrototypeOf() {
      throw new TypeError("Store prototypes cannot be changed");
    },
    preventExtensions() {
      throw new TypeError("Store extensibility cannot be changed");
    },
  });
  cache.set(value, proxy);
  rawValues.set(proxy, value);
  return proxy as T;
}
function merge(target: Record<PropertyKey, any>, value: unknown): void {
  if (!wrappable(value))
    throw new TypeError("Store merge requires an object or array");
  for (const key of Object.keys(value)) write(target, key, value[key]);
}
function update(
  target: Record<PropertyKey, any>,
  path: unknown[],
  traversed: Key[] = [],
): void {
  if (path.length > 1) {
    const [selector, ...rest] = path;
    if (Array.isArray(selector)) {
      for (const key of selector) update(target, [key, ...rest], traversed);
      return;
    }
    if (Array.isArray(target) && typeof selector === "function") {
      for (let index = 0; index < target.length; index++)
        if (selector(wrap(target[index]), index))
          update(target, [index, ...rest], traversed);
      return;
    }
    if (
      Array.isArray(target) &&
      selector !== null &&
      typeof selector === "object"
    ) {
      const { from = 0, to = target.length - 1, by = 1 } = selector as Range;
      if (
        ![from, to, by].every(Number.isSafeInteger) ||
        from < 0 ||
        to < -1 ||
        by <= 0
      )
        throw new TypeError(
          "Store ranges require nonnegative integer bounds and a positive integer step",
        );
      for (let index = from; index <= to; index += by)
        update(target, [index, ...rest], traversed);
      return;
    }
    if (!["string", "number", "symbol"].includes(typeof selector))
      throw new TypeError("Invalid store path selector");
    const key =
      typeof selector === "number"
        ? String(selector)
        : (selector as PropertyKey);
    if (unsafe(key)) throw new TypeError(`Unsafe store path: ${String(key)}`);
    if (rest.length > 1) {
      if (!wrappable(target[key]))
        throw new TypeError(`Store path is not an object: ${String(key)}`);
      update(target[key], rest, [key, ...traversed]);
      return;
    }
    const previous = target[key];
    const value =
      typeof rest[0] === "function"
        ? rest[0](wrap(previous), [key, ...traversed])
        : rest[0];
    if (raw(value) === previous) return;
    if (wrappable(previous) && wrappable(value) && !Array.isArray(value))
      merge(previous, value);
    else write(target, key, value);
    return;
  }
  let value = path[0];
  if (typeof value === "function") value = value(wrap(target), traversed);
  value = raw(value);
  if (value == null || value === target) return;
  if (Array.isArray(target) && Array.isArray(value)) {
    for (let index = 0; index < value.length; index++)
      write(target, String(index), value[index]);
    write(target, "length", value.length);
  } else merge(target, value);
}

export function createStore<T extends object = {}>(
  initial: T = {} as T,
  _options?: { name?: string },
): [T, SetStoreFunction<T>] {
  const target = raw(initial);
  if (!wrappable(target))
    throw new TypeError("Store root must be a plain object or array");
  if (!Object.isExtensible(target))
    throw new TypeError("Store root must be extensible");
  const setter = (...path: unknown[]) =>
    batch(() =>
      untrack(() => {
        if (!path.length) throw new TypeError("Store setter requires a value");
        update(target, path);
      }),
    );
  return [wrap(target), setter as SetStoreFunction<T>];
}

/** Tracked writable view sharing identity and updates with readonly stores. */
export function createMutable<T extends object>(
  initial: T,
  options: { equals?: Equality } = {},
): T {
  const target = raw(initial);
  if (!wrappable(target))
    throw new TypeError("Store root must be a plain object or array");
  return wrap(target, "mutable", options.equals ?? strictEqual);
}

/** Apply a store modifier (such as produce or reconcile) to a mutable store inside a batched untracked scope. */
export function modifyMutable<T>(state: T, modifier: (state: T) => T): void {
  batch(() => untrack(() => modifier(raw(state))));
}

export function produce<T>(fn: (s: T) => void): (s: T) => T {
  return (value) => {
    if (wrappable(raw(value)))
      batch(() => untrack(() => fn(wrap(value, "draft"))));
    return value;
  };
}

export function reconcile<T>(
  snapshot: T,
  options: { key?: string | null; merge?: boolean } = {},
): (state: T) => T {
  const key = options.key === undefined ? "id" : options.key;
  function collect(value: unknown, nodes: WeakSet<object>): void {
    value = raw(value);
    if (!wrappable(value) || nodes.has(value)) return;
    nodes.add(value);
    for (const descriptor of Object.values(
      Object.getOwnPropertyDescriptors(value),
    ))
      if ("value" in descriptor) collect(descriptor.value, nodes);
  }
  // Context is per invocation: reused modifiers must observe the latest graph.
  type Context = {
    old: WeakSet<object>;
    incoming: WeakSet<object>;
    results: WeakMap<object, object>;
    used: WeakMap<object, object>;
  };
  function apply(
    previous: any,
    next: any,
    root: boolean,
    context: Context,
  ): any {
    next = raw(next);
    previous = raw(previous);
    if (!wrappable(next)) return next;
    const mapped = context.results.get(next);
    if (mapped) return mapped;
    // Live snapshot references retain their identity and must never be mutated
    // while reconciling a different branch or an array reorder.
    if (context.old.has(next)) {
      context.results.set(next, next);
      return next;
    }
    if (
      !wrappable(previous) ||
      Array.isArray(previous) !== Array.isArray(next) ||
      (!root && key && previous[key] !== next[key]) ||
      context.incoming.has(previous) ||
      (context.used.has(previous) && context.used.get(previous) !== next)
    ) {
      // Reserve a result before descending so new branches can refer back to
      // an already reconciled ancestor. Keep the original snapshot object when
      // none of its data references needed remapping; never mutate that object.
      const replacement = Array.isArray(next)
        ? []
        : Object.create(Object.getPrototypeOf(next));
      context.results.set(next, replacement);
      const descriptors = Object.getOwnPropertyDescriptors(next);
      let changed = false;
      for (const property of Reflect.ownKeys(descriptors)) {
        if (unsafe(property))
          throw new TypeError(`Unsafe store path: ${String(property)}`);
        const descriptor = Reflect.get(
          descriptors,
          property,
        ) as PropertyDescriptor;
        if ("value" in descriptor) {
          const resolved = apply(undefined, descriptor.value, false, context);
          if (resolved !== raw(descriptor.value)) changed = true;
          descriptor.value = resolved;
        }
      }
      if (!changed) {
        context.results.set(next, next);
        return next;
      }
      Object.defineProperties(replacement, descriptors);
      return replacement;
    }
    context.results.set(next, previous);
    context.used.set(previous, next);
    if (Array.isArray(previous) && Array.isArray(next)) {
      const keyed =
        next.length &&
        previous.length &&
        (!options.merge || (key && next[0]?.[key] != null));
      if (keyed) {
        const available = new Map<unknown, any[]>();
        const identity = (item: any) =>
          key && item != null ? item[key] : item;
        for (let index = previous.length - 1; index >= 0; index--) {
          const item = previous[index];
          const id = identity(item);
          const list = available.get(id);
          if (list) list.push(item);
          else available.set(id, [item]);
        }
        const values = next.map((item) => {
          const list = available.get(identity(item));
          return apply(list?.pop(), item, false, context);
        });
        for (let index = 0; index < values.length; index++)
          write(previous, String(index), values[index]);
      } else
        for (let index = 0; index < next.length; index++)
          write(
            previous,
            String(index),
            apply(previous[index], next[index], false, context),
          );
      write(previous, "length", next.length);
    } else {
      for (const property of Object.keys(next)) {
        if (unsafe(property))
          throw new TypeError(`Unsafe store path: ${property}`);
        write(
          previous,
          property,
          apply(
            (previous as Record<string, unknown>)[property],
            next[property],
            false,
            context,
          ),
        );
      }
      for (const property of Object.keys(previous))
        if (!Object.hasOwn(next, property) || next[property] === undefined)
          write(previous, property, undefined);
    }
    return previous;
  }
  return (value) =>
    batch(() =>
      untrack(() => {
        const context: Context = {
          old: new WeakSet(),
          incoming: new WeakSet(),
          results: new WeakMap(),
          used: new WeakMap(),
        };
        collect(value, context.old);
        collect(snapshot, context.incoming);
        return wrap(apply(value, snapshot, true, context));
      }),
    );
}
