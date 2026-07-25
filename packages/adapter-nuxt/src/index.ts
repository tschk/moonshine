/**
 * @tschk/moonshine-nuxt
 *
 * Nuxt is Vue. Re-export the Vue bridge so Nuxt apps import one package name.
 * Prefer `ref`/`computed` wrappers from `@tschk/moonshine-vue` in `<script setup>`.
 */

export {
  createSignal,
  createMemo,
  createStore,
  batch,
} from "@tschk/moonshine";

export type { Memo, Signal, StoreSetter } from "@tschk/moonshine";

export { state, derived, effect } from "@tschk/moonshine/runes";

export * from "@tschk/moonshine-vue";
