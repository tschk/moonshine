/**
 * @tschk/moonshine — hyperminimal signal runtime (no React).
 *
 * Import what you need:
 *   import { createSignal, createMemo } from "@tschk/moonshine"
 *   import { createApp, useSignal } from "@tschk/moonshine/react"
 *   import { state, derived, effect } from "@tschk/moonshine/runes"
 *   import { MoonshineRouter } from "@tschk/moonshine/router"
 *   import { createMoonshineServer } from "@tschk/moonshine/server"
 *   import { useFragmentShader } from "@tschk/moonshine/shaders"
 */

export {
  batch,
  createMemo,
  createSignal,
  createStore,
  untrack,
} from "./signal";
export type { Memo, Signal, StoreSetter } from "./signal";

export { createResource } from "./resource";
export type {
  CreateResourceOptions,
  Resource,
  ResourceStatus,
} from "./resource";
