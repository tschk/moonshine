type Listener = () => void;

export type Trackable = {
  subscribe: (listener: Listener) => () => void;
  version: number;
  validate?: () => void;
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
  subscribe: (listener: Listener, request?: InvalidationRequest) => () => void;
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
  let failed = false;
  let failure: unknown;
  try {
    fn();
  } catch (error) {
    failed = true;
    failure = error;
  }
  batchDepth--;
  if (batchDepth === 0 && pending.size > 0) {
    const queue = [...pending];
    pending.clear();
    try {
      flushListeners(queue);
    } catch (error) {
      // A callback failure takes precedence over notification failures.
      if (!failed) failure = error;
      failed = true;
    }
  }
  if (failed) throw failure;
}

function flushListeners(listeners: Iterable<Listener>): void {
  let failed = false;
  let failure: unknown;
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
  }
  if (failed) throw failure;
}

function notifyListeners(listeners: Set<Listener>): void {
  if (batchDepth > 0) {
    for (const listener of listeners) pending.add(listener);
    return;
  }
  flushListeners(Array.from(listeners));
}

function track(dep: Source): void {
  currentTracker?.(dep);
}

/** Whether a synchronous dependency collector is currently active. */
export function isTracking(): boolean {
  return currentTracker !== null;
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
 * Opt-in schedulers observe first-read versions; derived values can retain the
 * enclosing memo's graph by propagating dependencies to its tracker.
 */
export function collectDeps(
  fn: () => void,
  onTrack?: (dependency: Trackable) => void,
  propagate = false,
): Trackable[] {
  const deps: Trackable[] = [];
  const seen = new Set<Trackable>();
  const previous = currentTracker;
  currentTracker = (dep) => {
    if (seen.has(dep)) return;
    seen.add(dep);
    deps.push(dep);
    if (propagate) previous?.(dep);
    if (onTrack) untrack(() => onTrack(dep));
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
    subscribe: (listener: Listener, request?: InvalidationRequest) => {
      if (request) return request.accept(node, undefined, listeners);
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
    if (invalidationRegistry)
      invalidationRegistry.commit(node, node.version, () =>
        notifyListeners(listeners),
      );
    else notifyListeners(listeners);
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

type MemoState<T> = {
  compute: () => T;
  listeners: Set<Listener>;
  deps: Array<{ node: Source; version: number }>;
  unsubs: Array<() => void>;
  value: T;
  hasValue: boolean;
  stale: boolean;
  checkedAt: number;
  node: Source;
  onDepChange: () => void;
};

function memoObserve<T>(state: MemoState<T>): void {
  for (const unsub of state.unsubs) unsub();
  state.unsubs.length = 0;
  for (const dep of state.deps) {
    state.unsubs.push(dep.node.subscribe(state.onDepChange));
  }
}

function memoUnobserve<T>(state: MemoState<T>): void {
  for (const unsub of state.unsubs) unsub();
  state.unsubs.length = 0;
}

function memoOnDepChange<T>(state: MemoState<T>): void {
  const before = state.node.version;
  memoValidate(state);
  // Only wake downstream when the derived value actually moved.
  if (state.node.version !== before) notifyListeners(state.listeners);
}

function memoRecompute<T>(state: MemoState<T>): void {
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
    next = state.compute();
  } finally {
    currentTracker = previous;
  }

  // Re-subscribing tears down and rebuilds the whole upstream chain, so only
  // do it when the dependency set actually moved.
  const sameDeps =
    collected.length === state.deps.length &&
    collected.every((entry, index) => entry.node === state.deps[index]!.node);

  state.deps = collected;
  invalidationRegistry?.dependencies(state.node, collected);
  state.stale = false;
  if (state.listeners.size > 0 && (!sameDeps || state.unsubs.length === 0)) {
    memoObserve(state);
  }

  if (!state.hasValue || !Object.is(next, state.value)) {
    state.value = next;
    state.hasValue = true;
    state.node.version = ++versionCounter;
  }
}

function memoValidate<T>(state: MemoState<T>): void {
  if (!state.stale && state.checkedAt === epoch) return;
  state.checkedAt = epoch;
  try {
    if (!state.stale) {
      let changed = false;
      for (const dep of state.deps) {
        dep.node.validate();
        if (dep.node.version !== dep.version) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
    }
    memoRecompute(state);
  } catch (error) {
    // Failed validation must retry, never serve the old value at this epoch.
    state.checkedAt = -1;
    throw error;
  }
}

/**
 * Derived value that recomputes when tracked dependencies change.
 * Any `createSignal` / `createMemo` read during `compute` is tracked.
 *
 * Recomputation is pull-based: an unread memo with no subscribers costs nothing
 * when its sources change, and a memo validates its whole dependency chain
 * before answering, so it never reports a half-updated view of the graph.
 */
export function createMemo<T>(compute: () => T): Memo<T> {
  const state = {
    compute,
    listeners: new Set<Listener>(),
    deps: [],
    unsubs: [],
    value: undefined as unknown as T,
    hasValue: false,
    stale: true,
    checkedAt: -1,
  } as unknown as MemoState<T>;

  state.onDepChange = () => memoOnDepChange(state);

  state.node = {
    version: ++versionCounter,
    validate: () => memoValidate(state),
    subscribe: (listener: Listener, request?: InvalidationRequest) => {
      if (request) return request.accept(state.node, state, state.listeners);
      // Dependencies are only observed while somebody is listening, so the
      // push path exists solely to serve real subscribers.
      memoValidate(state);
      state.listeners.add(listener);
      if (state.listeners.size === 1) memoObserve(state);
      return () => {
        state.listeners.delete(listener);
        if (state.listeners.size === 0) memoUnobserve(state);
      };
    },
  };

  const read = (() => {
    // Validate before tracking, so the enclosing memo records the version this
    // node settles on rather than the one it is about to leave behind.
    memoValidate(state);
    track(state.node);
    return state.value;
  }) as Memo<T>;

  read.peek = () => {
    memoValidate(state);
    return state.value;
  };
  read.subscribe = state.node.subscribe;

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
    const out = Object.create(Object.getPrototypeOf(value));
    for (const key of Object.keys(value))
      Object.defineProperty(out, key, {
        value: clone(Reflect.get(value, key)),
        writable: true,
        enumerable: true,
        configurable: true,
      });
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
    subscribe: (listener: Listener, request?: InvalidationRequest) => {
      if (request) return request.accept(node, undefined, listeners);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const notify = () => {
    node.version = ++versionCounter;
    epoch++;
    if (invalidationRegistry)
      invalidationRegistry.commit(node, node.version, () =>
        notifyListeners(listeners),
      );
    else notifyListeners(listeners);
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
        const own = Object.hasOwn(obj, prop);
        if (own && Object.is(prev, value)) return true;
        const ok =
          prop === "__proto__" && !own
            ? Reflect.defineProperty(obj, prop, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
              })
            : Reflect.set(obj, prop, value, receiver);
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

export type InvalidationObserver = {
  invalidate(origin: Trackable, revision: number): void;
  notify(): void;
  demand?: boolean;
};
type InvalidationRequest = {
  accepted: boolean;
  accept(
    node: Source,
    memo?: MemoState<unknown>,
    listeners?: ReadonlySet<Listener>,
  ): () => void;
};
type InvalidationRegistry = {
  subscribe(node: Trackable, observer: InvalidationObserver): () => void;
  dependencies(node: Source, deps: readonly { node: Source }[]): void;
  demand(node: Source): boolean;
  commit(node: Source, revision: number, notify: () => void): void;
};
let invalidationRegistry: InvalidationRegistry | undefined;

/**
 * Observe input writes without turning memo observation into value demand.
 * Initial observation may validate once. Mark callbacks precede wake/value callbacks;
 * nested writes finish draining by the outermost observed source setter return.
 */
export function subscribeInvalidation(
  node: Trackable,
  observer: InvalidationObserver,
): () => void {
  return (invalidationRegistry ??= createInvalidationRegistry()).subscribe(
    node,
    observer,
  );
}

function releaseInvalidationStops(stops: Iterable<() => void>): void {
  let bad = false,
    error: unknown;
  for (const stop of stops)
    try {
      stop();
    } catch (next) {
      if (!bad) error = next;
      bad = true;
    }
  if (bad) throw error;
}

function createInvalidationRegistry(): InvalidationRegistry {
  type Registration = { active: boolean; observer: InvalidationObserver };
  type Entry = {
    node: Source;
    memo?: MemoState<unknown>;
    listeners?: ReadonlySet<Listener>;
    active: boolean;
    observers: Set<Registration>;
    parents: Set<Entry>;
    stops: Map<Source, () => void>;
  };
  const entries = new WeakMap<Source, Entry>();
  const origins: Array<{
    node: Source;
    revision: number;
    notify: () => void;
    generation: number;
  }> = [];
  const wakes = new Map<Registration, number>();
  const values: Array<{ notify: () => void; generation: number }> = [];
  // Sibling writes from one callback share a generation. Only a later callback
  // advances causal depth, so wide graphs are not mistaken for feedback.
  let currentGeneration = 0;
  let running = false,
    marking = false,
    failed = false;
  let failure: unknown;
  function capture(fn: () => void, generation = currentGeneration): void {
    const previous = currentGeneration;
    currentGeneration = generation;
    try {
      fn();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    } finally {
      currentGeneration = previous;
    }
  }
  function inactive(entry: Entry): void {
    if (entry.observers.size || entry.parents.size || !entry.active) return;
    entry.active = false;
    const stops = entry.stops;
    entry.stops = new Map();
    releaseInvalidationStops(stops.values());
  }
  function entryFor(
    node: Source,
    memo?: MemoState<unknown>,
    listeners?: ReadonlySet<Listener>,
  ): Entry {
    let entry = entries.get(node);
    if (!entry)
      entries.set(
        node,
        (entry = {
          node,
          memo,
          listeners,
          active: false,
          observers: new Set(),
          parents: new Set(),
          stops: new Map(),
        }),
      );
    return entry;
  }
  function invoke(
    node: Trackable,
    accept: InvalidationRequest["accept"],
  ): () => void {
    const request: InvalidationRequest = {
      accepted: false,
      accept(source, memo, listeners) {
        request.accepted = true;
        return accept(source, memo, listeners);
      },
    };
    const stop = (node as Source).subscribe(() => {}, request);
    if (!request.accepted) {
      const error = new Error(
        "Trackable does not support invalidation observation",
      );
      try {
        stop();
      } catch {
        /* The unsupported protocol error remains primary. */
      }
      throw error;
    }
    return stop;
  }
  function activate(entry: Entry): void {
    if (entry.active) return;
    entry.active = true;
    try {
      if (entry.memo) sync(entry, entry.memo.deps);
    } catch (error) {
      entry.active = false;
      const stops = entry.stops;
      entry.stops = new Map();
      try {
        releaseInvalidationStops(stops.values());
      } catch {
        /* Preserve the activation error. */
      }
      throw error;
    }
  }
  function link(node: Source, parent: Entry): () => void {
    return invoke(node, (source, memo, listeners) => {
      if (memo && !memo.hasValue) memoValidate(memo);
      const entry = entryFor(source, memo, listeners);
      entry.parents.add(parent);
      try {
        activate(entry);
      } catch (error) {
        entry.parents.delete(parent);
        throw error;
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        entry.parents.delete(parent);
        inactive(entry);
      };
    });
  }
  function sync(entry: Entry, deps: readonly { node: Source }[]): void {
    const next = new Map<Source, () => void>();
    try {
      for (const dep of deps)
        if (!next.has(dep.node))
          next.set(
            dep.node,
            entry.stops.get(dep.node) ?? link(dep.node, entry),
          );
    } catch (error) {
      try {
        releaseInvalidationStops(
          [...next]
            .filter(([node]) => !entry.stops.has(node))
            .map(([, stop]) => stop),
        );
      } catch {
        /* Preserve the connection error. */
      }
      throw error;
    }
    const old = entry.stops;
    entry.stops = next;
    releaseInvalidationStops(
      [...old].filter(([node]) => !next.has(node)).map(([, stop]) => stop),
    );
  }
  function mark(): void {
    if (marking) return;
    marking = true;
    try {
      while (origins.length) {
        const origin = origins.shift()!;
        values.push({ notify: origin.notify, generation: origin.generation });
        const first = entries.get(origin.node);
        if (!first) continue;
        const frontier = [first],
          visited = new Set<Entry>();
        while (frontier.length) {
          const entry = frontier.pop()!;
          if (visited.has(entry) || !entry.active) continue;
          visited.add(entry);
          frontier.push(...entry.parents);
          // Snapshot registrations: callbacks may dispose or add observations.
          const registrations = Array.from(entry.observers);
          for (const registration of registrations)
            if (registration.active) {
              capture(
                () =>
                  registration.observer.invalidate(
                    origin.node,
                    origin.revision,
                  ),
                origin.generation,
              );
              if (registration.active)
                wakes.set(
                  registration,
                  Math.max(wakes.get(registration) ?? 0, origin.generation),
                );
            }
        }
      }
    } finally {
      marking = false;
    }
  }
  return {
    subscribe(node, observer) {
      return invoke(node, (source, memo, listeners) => {
        if (memo) memoValidate(memo);
        const entry = entryFor(source, memo, listeners);
        const registration: Registration = { active: true, observer };
        entry.observers.add(registration);
        try {
          activate(entry);
        } catch (error) {
          entry.observers.delete(registration);
          registration.active = false;
          throw error;
        }
        return () => {
          if (!registration.active) return;
          registration.active = false;
          entry.observers.delete(registration);
          wakes.delete(registration);
          inactive(entry);
        };
      });
    },
    demand(node) {
      const entry = entries.get(node);
      if (!entry) return false;
      const frontier = [entry],
        visited = new Set<Entry>();
      while (frontier.length) {
        const current = frontier.pop()!;
        if (visited.has(current) || !current.active) continue;
        visited.add(current);
        if (
          current.listeners?.size ||
          [...current.observers].some(
            ({ active, observer }) => active && observer.demand !== false,
          )
        )
          return true;
        frontier.push(...current.parents);
      }
      return false;
    },
    dependencies(node, deps) {
      const entry = entries.get(node);
      if (entry?.active) sync(entry, deps);
    },
    commit(node, revision, notify) {
      if (!running && !entries.get(node)?.active) {
        notify();
        return;
      }
      const generation = running ? currentGeneration + 1 : 1;
      if (generation > 1000) {
        capture(() => {
          throw new Error("Invalidation update limit exceeded");
        });
        return;
      }
      origins.push({ node, revision, notify, generation });
      if (running) {
        mark();
        return;
      }
      running = true;
      failed = false;
      failure = undefined;
      try {
        while (origins.length || wakes.size || values.length) {
          mark();
          const wake = wakes.entries().next().value as
            [Registration, number] | undefined;
          if (wake) {
            const [registration, wakeGeneration] = wake;
            wakes.delete(registration);
            if (registration.active)
              capture(() => registration.observer.notify(), wakeGeneration);
            continue;
          }
          const value = values.shift();
          if (value) capture(value.notify, value.generation);
        }
      } catch (error) {
        capture(() => {
          throw error;
        });
      } finally {
        running = false;
        origins.length = values.length = 0;
        wakes.clear();
        currentGeneration = 0;
      }
      if (failed) throw failure;
    },
  };
}

export { track as trackDependency };

/** Query native value-consumer reachability without validating or registering an observer. */
export function hasValueDemand(node: Trackable): boolean {
  let demand = false;
  const request: InvalidationRequest = {
    accepted: false,
    accept(source, memo, listeners) {
      request.accepted = true;
      demand =
        !!listeners?.size ||
        !!memo?.listeners.size ||
        (invalidationRegistry?.demand(source) ?? false);
      return () => {};
    },
  };
  const stop = (node as Source).subscribe(() => {}, request);
  if (!request.accepted) {
    const error = new Error("Trackable does not support demand inspection");
    try {
      stop();
    } catch {
      /* The unsupported protocol error remains primary. */
    }
    throw error;
  }
  return demand;
}
