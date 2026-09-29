/**
 * @tschk/moonshine-nuxt
 *
 * Hosting adapter: Nuxt compiles Vue SFCs and owns its nitro/app runtime.
 * Moonshine cannot replace that compiler. `nuxt` and `vue` are peers,
 * re-exported on subpaths, with moonshine signal bridges onto Vue refs.
 */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export type VueRef<T> = {
  get value(): T;
  set value(next: T);
};

export function fromMoonshineSignal<T>(signal: MsSignal<T>): VueRef<T> {
  return {
    get value() {
      return signal();
    },
    set value(next: T) {
      signal.set(next);
    },
  };
}

export function createBridgedRef<T>(initial: T): VueRef<T> {
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
