/**
 * @tschk/moonshine-nuxt
 *
 * Nuxt is Vue. Re-export the Vue bridge plus Nuxt-friendly aliases
 * (`useMoonshineRef` / `useMoonshineComputed`) for `<script setup>`.
 */

export {
  batch,
  computedFromMemo,
  createMemo,
  createSignal,
  createStore,
  derived,
  effect,
  moonshineComputed,
  moonshineRef,
  refFromSignal,
  state,
  untrack,
} from "@tschk/moonshine-vue";

export type { Memo, Signal, StoreSetter } from "@tschk/moonshine-vue";

import {
  moonshineComputed,
  moonshineRef,
  type Memo,
  type Signal,
} from "@tschk/moonshine-vue";
import type { ComputedRef, Ref } from "vue";

/** Nuxt/composables-style alias for `moonshineRef`. */
export function useMoonshineRef<T>(initial: T): Ref<T> {
  return moonshineRef(initial);
}

/** Nuxt/composables-style alias for `moonshineComputed`. */
export function useMoonshineComputed<T>(fn: () => T): ComputedRef<T> {
  return moonshineComputed(fn);
}

export type { ComputedRef, Ref, Memo as MoonshineMemo, Signal as MoonshineSignal };
