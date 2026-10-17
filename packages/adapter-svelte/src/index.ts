/** Independent store bridge; component-language parsing belongs in Crepus. */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";
import { writable, type Writable } from "./store";

export type SvelteWritable<T> = Writable<T>;

/** Store subscribers share one kernel subscription while they are active. */
export function fromMoonshineSignal<T>(signal: MsSignal<T>): SvelteWritable<T> {
  let mirrored = signal.peek();
  const store = writable(mirrored, (set) => {
    mirrored = signal.peek();
    set(mirrored);
    return signal.subscribe(() => {
      const current = signal.peek();
      if (!Object.is(mirrored, current)) {
        mirrored = current;
        set(current);
      }
    });
  });
  function set(next: T): void {
    const previous = signal.peek();
    signal.set(() => next);
    const current = signal.peek();
    // Preserve store object notifications without duplicating deferred kernel writes.
    if (Object.is(previous, current) || !Object.is(mirrored, current)) {
      mirrored = current;
      store.set(current);
    }
  }
  return {
    subscribe: store.subscribe,
    set,
    update: (fn) => set(fn(signal.peek())),
  };
}

export function createBridgedWritable<T>(initial: T): SvelteWritable<T> {
  return fromMoonshineSignal(msCreateSignal(initial));
}

export { msCreateSignal as createMoonshineSignal };
export type { MsSignal as MoonshineSignal };
export {
  createResource,
  createSignal as createMsSignal,
  createMemo,
  batch,
  untrack,
} from "@tschk/moonshine";
export type { Resource, ResourceStatus } from "@tschk/moonshine";
export { crepusRenderer } from "./framework";
