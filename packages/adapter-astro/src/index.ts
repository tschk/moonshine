/**
 * @tschk/moonshine-astro
 *
 * Hosting adapter: Astro compiles `.astro` files. Moonshine cannot replace
 * that compiler. `astro` is a peer; the compiler is re-exported on a
 * subpath, with moonshine signal bridges for islands that share state.
 */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export type Readable<T> = {
  get: () => T;
  subscribe: (fn: (value: T) => void) => () => void;
};

export function fromMoonshineSignal<T>(signal: MsSignal<T>): Readable<T> {
  return {
    get: () => signal(),
    subscribe: (fn) => {
      fn(signal());
      return signal.subscribe(() => fn(signal()));
    },
  };
}

export function createBridgedReadable<T>(initial: T): Readable<T> {
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
