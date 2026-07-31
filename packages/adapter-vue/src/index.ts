/**
 * @tschk/moonshine-vue
 *
 * Vue 3 ref/computed bridge over `@tschk/moonshine` signals.
 */

import {
  createMemo,
  createSignal,
  type Memo,
  type Signal,
} from "@tschk/moonshine";
import { computed, customRef, type ComputedRef, type Ref } from "vue";

/** Bind a moonshine signal to a Vue ref. */
export function refFromSignal<T>(signal: Signal<T>): Ref<T> {
  return customRef((track, trigger) => {
    signal.subscribe(() => trigger());
    return {
      get() {
        track();
        return signal();
      },
      set(value: T) {
        signal.set(value);
        trigger();
      },
    };
  });
}

/** Create a Vue ref backed by a new moonshine signal. */
export function moonshineRef<T>(initial: T): Ref<T> {
  return refFromSignal(createSignal(initial));
}

/** Derive a Vue computed from a moonshine memo. */
export function computedFromMemo<T>(memo: Memo<T>): ComputedRef<T> {
  return computed(() => memo());
}

export function moonshineComputed<T>(fn: () => T): ComputedRef<T> {
  return computedFromMemo(createMemo(fn));
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
