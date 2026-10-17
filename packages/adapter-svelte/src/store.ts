/** Independent synchronous Svelte store protocol; no component runtime needed. */
import { subscribeTo, changed } from "./store-internal";
export type Subscriber<T> = (value: T) => void;
export type Invalidator<T> = (value?: T) => void;
export type Unsubscriber = () => void;
export type Updater<T> = (value: T) => T;
export type StartStopNotifier<T> = (
  set: (value: T) => void,
  update: (fn: Updater<T>) => void,
) => void | Unsubscriber;
export interface Readable<T> {
  subscribe(run: Subscriber<T>, invalidate?: Invalidator<T>): Unsubscriber;
}
export interface Writable<T> extends Readable<T> {
  set(value: T): void;
  update(fn: Updater<T>): void;
}
type Subscription<T> = { run: Subscriber<T>; invalidate: Invalidator<T> };
const notifications: Array<() => void> = [];
const noop = () => {};

export function writable<T>(
  initial?: T,
  start: StartStopNotifier<T> = noop,
): Writable<T> {
  let value = initial as T;
  let stop: Unsubscriber | undefined;
  const subscribers = new Set<Subscription<T>>();
  function set(next: T): void {
    if (!changed(value, next)) return;
    value = next;
    if (!stop) return;
    const flush = notifications.length === 0;
    let failure: unknown;
    let failed = false;
    for (const subscriber of subscribers) {
      try {
        subscriber.invalidate();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
      const current = value;
      notifications.push(() => subscriber.run(current));
    }
    if (flush) {
      try {
        for (let index = 0; index < notifications.length; index++) {
          try {
            notifications[index]!();
          } catch (error) {
            if (!failed) failure = error;
            failed = true;
          }
        }
      } finally {
        notifications.length = 0;
      }
    }
    if (failed) throw failure;
  }
  const update = (fn: Updater<T>) => set(fn(value));
  function subscribe(
    run: Subscriber<T>,
    invalidate: Invalidator<T> = noop,
  ): Unsubscriber {
    const subscriber = { run, invalidate };
    subscribers.add(subscriber);
    try {
      if (subscribers.size === 1) stop = start(set, update) || noop;
      run(value);
    } catch (error) {
      subscribers.delete(subscriber);
      if (!subscribers.size) {
        const cleanup = stop;
        stop = undefined;
        try {
          cleanup?.();
        } catch {
          /* Preserve subscription failure. */
        }
      }
      throw error;
    }
    return () => {
      if (!subscribers.delete(subscriber)) return;
      if (!subscribers.size) {
        const cleanup = stop;
        stop = undefined;
        cleanup?.();
      }
    };
  }
  return { subscribe, set, update };
}

export function readable<T>(
  initial?: T,
  start?: StartStopNotifier<T>,
): Readable<T> {
  return { subscribe: writable(initial, start).subscribe };
}

type Stores = Readable<any> | readonly Readable<any>[];
type Values<S> =
  S extends Readable<infer T>
    ? T
    : { [K in keyof S]: S[K] extends Readable<infer T> ? T : never };
export function derived<S extends Stores, T>(
  stores: S,
  fn: (values: Values<S>) => T,
  initial?: T,
): Readable<T>;
export function derived<S extends Stores, T>(
  stores: S,
  fn: (
    values: Values<S>,
    set: (value: T) => void,
    update: (fn: Updater<T>) => void,
  ) => void | Unsubscriber,
  initial?: T,
): Readable<T>;
export function derived<S extends Stores, T>(
  stores: S,
  fn: (
    values: Values<S>,
    set: (value: T) => void,
    update: (fn: Updater<T>) => void,
  ) => T | void | Unsubscriber,
  initial?: T,
): Readable<T> {
  const multiple = Array.isArray(stores);
  const inputs = (multiple ? stores : [stores]) as readonly Readable<unknown>[];
  if (!inputs.every((store) => store && typeof store.subscribe === "function"))
    throw new TypeError("derived expects readable stores");
  const automatic = fn.length < 2;
  return readable(initial, (set, update) => {
    const values: unknown[] = [];
    const pending = new Set<number>();
    const subscriptions: Unsubscriber[] = [];
    let active = false;
    let cleanup: Unsubscriber = noop;
    function sync(): void {
      if (pending.size) return;
      const previous = cleanup;
      cleanup = noop;
      previous();
      const result = fn(
        (multiple ? values : values[0]) as Values<S>,
        set,
        update,
      );
      if (automatic) set(result as T);
      else if (typeof result === "function") cleanup = result as Unsubscriber;
    }
    function release(): void {
      active = false;
      let failed = false;
      let failure: unknown;
      for (const unsubscribe of [...subscriptions, cleanup]) {
        try {
          unsubscribe();
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
      subscriptions.length = 0;
      cleanup = noop;
      if (failed) throw failure;
    }
    try {
      inputs.forEach((store, index) =>
        subscriptions.push(
          subscribeTo(
            store,
            (value) => {
              values[index] = value;
              pending.delete(index);
              if (active) sync();
            },
            () => {
              pending.add(index);
            },
          ),
        ),
      );
      active = true;
      sync();
    } catch (error) {
      try {
        release();
      } catch {
        /* Preserve derivation failure. */
      }
      throw error;
    }
    return release;
  });
}

export function get<T>(store: Readable<T>): T {
  let value!: T;
  subscribeTo(store, (current) => {
    value = current;
  })();
  return value;
}
