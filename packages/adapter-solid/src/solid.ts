/**
 * solid-js library re-exports for moonshine apps.
 *
 * ```ts
 * import { createSignal, createEffect, For, Show } from "@tschk/moonshine-solid/solid";
 * ```
 */
export {
  For,
  Index,
  Match,
  Show,
  Switch,
  batch,
  createEffect,
  createMemo,
  createResource,
  createRoot,
  createSignal,
  on,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
export type { Accessor, Resource, Setter } from "solid-js";
