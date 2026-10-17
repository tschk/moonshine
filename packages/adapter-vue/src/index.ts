/**
 * @tschk/moonshine-vue
 *
 * Independent signal bridges and lazy native SSR compatibility renderer.
 * Legacy Vue runtime/compiler entries are separate from native `/reactive`.
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
      signal.set(() => next);
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
export { crepusRenderer } from "./framework";
