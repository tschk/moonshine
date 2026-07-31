/**
 * Shared React-host surface for framework adapters.
 * Signals + hooks + resources + runes + jsx. No host router.
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

export {
  createApp,
  createIslandSignal,
  createMoonshineApp,
  renderToNode,
  useResource,
  useSignal,
  useStore,
} from "./react";
export type { MoonshineApp, MoonshineAppOptions } from "./react";

export { jsx, jsxs, Fragment } from "./jsx-runtime";
export type { JSX } from "./jsx-runtime";

export { state, derived, effect } from "./runes";
