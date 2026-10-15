/**
 * @tschk/moonshine-svelte
 *
 * Hosting adapter: Svelte stays the compiler. Moonshine cannot replace
 * `.svelte` files. This package re-exports `svelte` on subpaths and
 * bridges moonshine signals onto a Svelte-store shape.
 */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export type SvelteWritable<T> = {
  subscribe: (fn: (value: T) => void) => () => void;
  set: (value: T) => void;
  update: (fn: (value: T) => T) => void;
};

/** One-way share: moonshine signal → Svelte writable contract. */
export function fromMoonshineSignal<T>(signal: MsSignal<T>): SvelteWritable<T> {
  return {
    subscribe(fn) {
      fn(signal());
      return signal.subscribe(() => fn(signal()));
    },
    set(value) {
      signal.set(value);
    },
    update(fn) {
      signal.set(fn(signal.peek()));
    },
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
export { crepusRenderer } from "@tschk/crepus-moonshine";
