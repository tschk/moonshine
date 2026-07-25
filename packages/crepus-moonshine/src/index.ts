/** View IR document types — `ViewIr` is the emit/CLI alias for `CrepusIr`. */
export type { CrepusIr, ViewIr } from "./types";

export {
  renderCrepusIr,
  renderCrepusNode,
  type CrepusNode,
  type RenderCrepusOptions,
} from "./render";

export type * from "./types";

// Re-export light moonshine surface so CLI emit can depend on one package.
export {
  createApp,
  createMoonshineApp,
  createSignal,
  createMemo,
  createStore,
  useSignal,
} from "@tschk/moonshine";
