/**
 * @tschk/moonshine-svelte
 *
 * Svelte store + rune bridges over moonshine signals/resources.
 */
import {
  createMemo,
  createResource,
  createSignal,
  type Memo,
  type Resource,
  type Signal,
} from "@tschk/moonshine";

export type Readable<T> = {
  subscribe: (fn: (value: T) => void) => () => void;
  get: () => T;
};

export type Writable<T> = Readable<T> & {
  set: (value: T | ((prev: T) => T)) => void;
  update: (fn: (prev: T) => T) => void;
};

/** Wrap a moonshine signal as a Svelte-style writable store. */
export function writableFromSignal<T>(signal: Signal<T>): Writable<T> {
  return {
    get: () => signal(),
    set: (value) => signal.set(value),
    update: (fn) => signal.set(fn),
    subscribe: (fn) => {
      fn(signal());
      return signal.subscribe(() => fn(signal()));
    },
  };
}

/** Create a writable store backed by moonshine createSignal. */
export function moonshineWritable<T>(initial: T): Writable<T> {
  return writableFromSignal(createSignal(initial));
}

/** Derive a readable store from a moonshine memo. */
export function moonshineDerived<T>(fn: () => T): Readable<T> {
  const memo: Memo<T> = createMemo(fn);
  return {
    get: () => memo(),
    subscribe: (listener) => {
      listener(memo());
      return memo.subscribe(() => listener(memo()));
    },
  };
}

/** Readable view of a Resource's data. */
export function readableResource<T>(resource: Resource<T>): Readable<T | undefined> & {
  loading: Readable<boolean>;
  error: Readable<Error | undefined>;
  refetch: () => Promise<T | undefined>;
} {
  return {
    get: () => resource(),
    subscribe: (fn) => {
      fn(resource());
      return resource.subscribe(() => fn(resource()));
    },
    loading: {
      get: () => resource.loading(),
      subscribe: (fn) => {
        fn(resource.loading());
        return resource.loading.subscribe(() => fn(resource.loading()));
      },
    },
    error: {
      get: () => resource.error(),
      subscribe: (fn) => {
        fn(resource.error());
        return resource.error.subscribe(() => fn(resource.error()));
      },
    },
    refetch: () => resource.refetch(),
  };
}

export function moonshineResource<T>(
  fetcher: () => Promise<T>,
  opts?: { initial?: T; immediate?: boolean },
): Resource<T> {
  return createResource(fetcher, opts);
}

/**
 * Svelte 5 helper: getter/setter pair over a moonshine signal.
 */
export function runeBridge<T>(signal: Signal<T>): {
  get value(): T;
  set value(v: T);
} {
  return {
    get value() {
      return signal();
    },
    set value(v: T) {
      signal.set(v);
    },
  };
}

/** Convert Svelte-like writable into moonshine signal (one-way bind). */
export function signalFromWritable<T>(store: {
  subscribe: (fn: (v: T) => void) => () => void;
  set?: (v: T) => void;
}): Signal<T> {
  let current!: T;
  const unsub = store.subscribe((v) => {
    current = v;
  });
  unsub();
  const signal = createSignal(current);
  store.subscribe((v) => signal.set(() => v));
  if (store.set) {
    const set = signal.set.bind(signal);
    signal.set = (value) => {
      const next =
        typeof value === "function" ? (value as (p: T) => T)(signal.peek()) : value;
      set(next);
      store.set!(next);
    };
  }
  return signal;
}

export {
  batch,
  createMemo,
  createResource,
  createSignal,
  createStore,
  untrack,
} from "@tschk/moonshine";
export type { Memo, Resource, Signal, StoreSetter } from "@tschk/moonshine";
export { state, derived, effect } from "@tschk/moonshine/runes";
