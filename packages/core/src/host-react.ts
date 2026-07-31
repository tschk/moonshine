/**
 * Shared React-host surface for framework adapters.
 * Signals + hooks + runes + jsx. No host router (Next/Remix own routing).
 *
 * ```ts
 * export * from "@tschk/moonshine/host-react";
 * ```
 */
export {
  batch,
  createMemo,
  createSignal,
  createStore,
  untrack,
} from "./signal";
export type { Memo, Signal, StoreSetter } from "./signal";

export {
  createApp,
  createMoonshineApp,
  renderToNode,
  useSignal,
  useStore,
} from "./react";
export type { MoonshineApp, MoonshineAppOptions } from "./react";

export { jsx, jsxs, Fragment } from "./jsx-runtime";
export type { JSX } from "./jsx-runtime";

export { state, derived, effect } from "./runes";
