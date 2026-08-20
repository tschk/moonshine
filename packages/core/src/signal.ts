type Listener = () => void;

export type Trackable = {
  subscribe: (listener: Listener) => () => void;
  version: number;
};

/**
 * A node in the reactive graph.
 *
 * `version` changes only when the node's *value* changes, which lets a consumer
 * tell "something upstream fired" apart from "my input actually differs".
 * `validate` brings the node's cached value up to date on demand, so reads pull
 * rather than writes pushing all the way down.
 */
type Source = Trackable & {
  validate: () => void;
};

/**
 * Bumped once per write anywhere in the graph. A node that already validated at
 * the current epoch cannot be stale, so repeated reads stay O(1).
 */
let epoch = 0;
/** Monotonic stamp handed out whenever a node's value actually changes. */
let versionCounter = 0;

let batchDepth = 0;
const pending = new Set<Listener>();
let currentTracker: ((dep: Source) => void) | null = null;

/** Coalesce nested writes into one subscriber flush. */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pending.size > 0) {
      const queue = [...pending];
      pending.clear();
      for (const listener of queue) listener();
    }
  }
}

function notifyListeners(listeners: Set<Listener>): void {
  if (batchDepth > 0) {
    for (const listener of listeners) pending.add(listener);
    return;
  }
  for (const listener of Array.from(listeners)) listener();
}

function track(dep: Source): void {
  currentTracker?.(dep);
}

/** Read without subscribing the enclosing memo or effect to what you touch. */
export function untrack<T>(fn: () => T): T {
  const previous = currentTracker;
  currentTracker = null;
  try {
    return fn();
  } finally {
    currentTracker = previous;
  }
}

/**
 * Run `fn` while collecting signal/memo/store deps via the active tracker.
 * Used by `@tschk/moonshine/runes` `effect`.
 */
export function collectDeps(fn: () => void): Trackable[] {
  const deps: Trackable[] = [];
  const seen = new Set<Trackable>();
  const previous = currentTracker;
  currentTracker = (dep) => {
    if (seen.has(dep)) return;
    seen.add(dep);
    deps.push(dep);
  };
  try {
    fn();
  } finally {
    currentTracker = previous;
  }
  return deps;
}

export type Signal<T> = {
  (): T;
  set: (value: T | ((prev: T) => T)) => void;
  peek: () => T;
  subscribe: (listener: Listener) => () => void;
};

/**
 * Solid-inspired signal: read by calling, write via `.set`.
 * React apps subscribe with `useSignal` from `@tschk/moonshine/react`.
 */
export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const listeners = new Set<Listener>();
  const node: Source = {
    version: ++versionCounter,
    validate: () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const read = (() => {
    track(node);
    return value;
  }) as Signal<T>;

  read.set = (next) => {
    const resolved =
      typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    if (Object.is(resolved, value)) return;
    value = resolved;
    node.version = ++versionCounter;
    epoch++;
    notifyListeners(listeners);
  };
  read.peek = () => value;
  read.subscribe = node.subscribe;

  return read;
}

export type Memo<T> = {
  (): T;
  peek: () => T;
  subscribe: (listener: Listener) => () => void;
};

/**
 * Derived value that recomputes when tracked dependencies change.
 * Any `createSignal` / `createMemo` read during `compute` is tracked.
 *
 * Recomputation is pull-based: an unread memo with no subscribers costs nothing
 * when its sources change, and a memo validates its whole dependency chain
 * before answering, so it never reports a half-updated view of the graph.
 */
export function createMemo<T>(compute: () => T): Memo<T> {
  const listeners = new Set<Listener>();
  let deps: Array<{ node: Source; version: number }> = [];
  const unsubs: Array<() => void> = [];
  let value!: T;
  let hasValue = false;
  let stale = true;
  let checkedAt = -1;

  const node: Source = {
    version: ++versionCounter,
    validate: () => validate(),
    subscribe: (listener) => {
      // Dependencies are only observed while somebody is listening, so the
      // push path exists solely to serve real subscribers.
      validate();
      listeners.add(listener);
      if (listeners.size === 1) observe();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) unobserve();
      };
    },
  };

  function observe(): void {
    for (const unsub of unsubs.splice(0)) unsub();
    for (const dep of deps) unsubs.push(dep.node.subscribe(onDepChange));
  }

  function unobserve(): void {
    for (const unsub of unsubs.splice(0)) unsub();
  }

  function onDepChange(): void {
    const before = node.version;
    validate();
    // Only wake downstream when the derived value actually moved.
    if (node.version !== before) notifyListeners(listeners);
  }

  function recompute(): void {
    const collected: Array<{ node: Source; version: number }> = [];
    const seen = new Set<Source>();
    const previous = currentTracker;
    currentTracker = (dep) => {
      if (seen.has(dep)) return;
      seen.add(dep);
      collected.push({ node: dep, version: dep.version });
    };

    let next: T;
    try {
      next = compute();
    } finally {
      currentTracker = previous;
    }

    // Re-subscribing tears down and rebuilds the whole upstream chain, so only
    // do it when the dependency set actually moved.
    const sameDeps =
      collected.length === deps.length &&
      collected.every((entry, index) => entry.node === deps[index]!.node);

    deps = collected;
    stale = false;
    if (listeners.size > 0 && (!sameDeps || unsubs.length === 0)) observe();

    if (!hasValue || !Object.is(next, value)) {
      value = next;
      hasValue = true;
      node.version = ++versionCounter;
    }
  }

  function validate(): void {
    if (!stale && checkedAt === epoch) return;
    checkedAt = epoch;
    if (!stale) {
      let changed = false;
      for (const dep of deps) {
        dep.node.validate();
        if (dep.node.version !== dep.version) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
    }
    recompute();
  }

  const read = (() => {
    // Validate before tracking, so the enclosing memo records the version this
    // node settles on rather than the one it is about to leave behind.
    validate();
    track(node);
    return value;
  }) as Memo<T>;

  read.peek = () => {
    validate();
    return value;
  };
  read.subscribe = node.subscribe;

  return read;
}

export type StoreSetter<T extends object> = (fn: (state: T) => void) => void;

const storeRoots = new WeakMap<object, Trackable>();

/** Resolve the trackable root for a `createStore` proxy (used by `/react` hooks). */
export function getStoreRoot(store: object): Trackable | undefined {
  return storeRoots.get(store);
}

/**
 * Plain objects and arrays are the only things worth proxying. Wrapping a Date,
 * Map or class instance would hand its methods a proxy as `this`, which breaks
 * every implementation that reaches for internal slots.
 */
function isWrappable(value: unknown): value is object {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return (
    proto === Object.prototype || proto === Array.prototype || proto === null
  );
}

/**
 * Copy the caller's plain structure so later mutations go through the proxy,
 * and pass everything else through by reference. `structuredClone` throws on
 * functions and DOM nodes, and silently flattens class instances.
 */
function clone<V>(value: V): V {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as V;
  if (isWrappable(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = clone(entry);
    return out as V;
  }
  return value;
}

/**
 * Nested reactive store (Solid-inspired).
 * Mutate through the proxy (or `setStore`) to notify subscribers.
 */
export function createStore<T extends object>(initial: T): [T, StoreSetter<T>] {
  const listeners = new Set<Listener>();
  const state = clone(initial);

  const node: Source = {
    version: ++versionCounter,
    validate: () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const notify = () => {
    node.version = ++versionCounter;
    epoch++;
    notifyListeners(listeners);
  };

  // Cached so `store.user === store.user`, which React dependency arrays and
  // `React.memo` both compare by identity.
  const proxies = new WeakMap<object, object>();

  const wrap = <V extends object>(target: V): V => {
    const cached = proxies.get(target);
    if (cached) return cached as V;
    const proxy = new Proxy(target, {
      get(obj, prop, receiver) {
        track(node);
        const value = Reflect.get(obj, prop, receiver);
        if (isWrappable(value)) return wrap(value);
        return value;
      },
      set(obj, prop, value, receiver) {
        const prev = Reflect.get(obj, prop, receiver);
        if (Object.is(prev, value)) return true;
        const ok = Reflect.set(obj, prop, value, receiver);
        if (ok) notify();
        return ok;
      },
      deleteProperty(obj, prop) {
        if (!Object.prototype.hasOwnProperty.call(obj, prop)) return true;
        const ok = Reflect.deleteProperty(obj, prop);
        if (ok) notify();
        return ok;
      },
    });
    proxies.set(target, proxy);
    return proxy;
  };

  const proxy = wrap(state);
  storeRoots.set(proxy, node);

  const setStore: StoreSetter<T> = (fn) => {
    batch(() => {
      fn(proxy);
    });
  };

  return [proxy, setStore];
}
