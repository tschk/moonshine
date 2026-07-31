/**
 * @tschk/moonshine-svelte
 *
 * Store bridge wrapping `@tschk/moonshine` createSignal.
 * Use with Svelte 5 `$state` / `$derived` or classic store subscribe API.
 */

import {
  createMemo,
  createSignal,
  type Memo,
  type Signal,
} from "@tschk/moonshine";

export type Readable<T> = {
  subscribe: (fn: (value: T) => void) => () => void;
  get: () => T;
};

export type Writable<T> = Readable<T> & {
  set: (value: T | ((prev: T) => T)) => void;
};

/** Wrap a moonshine signal as a Svelte-style writable store. */
export function writableFromSignal<T>(signal: Signal<T>): Writable<T> {
  return {
    get: () => signal(),
    set: (value) => signal.set(value),
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

/**
 * Svelte 5 helper: getter/setter pair over a moonshine signal.
 * Prefer native `$state` inside pure Svelte apps.
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

export {
  batch,
  createMemo,
  createSignal,
  createStore,
  untrack,
} from "@tschk/moonshine";
export type { Memo, Signal, StoreSetter } from "@tschk/moonshine";
export { state, derived, effect } from "@tschk/moonshine/runes";
