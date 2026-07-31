/** The `.crepus` parser is the Rust one, compiled to WASM — never reimplemented here. */
export { parseCrepus, IR_VERSION } from "@tschk/crepus-wasm";
export type {
  CrepusContext,
  PickerOption,
  StackAxis,
  TabItem,
  ViewIr,
  ViewNode,
  ViewNodeKind,
  ViewStyle,
} from "@tschk/crepus-wasm";

/** Document alias kept for consumers that predate the WASM parser. */
export type { ViewIr as CrepusIr } from "@tschk/crepus-wasm";

export {
  renderCrepusIr,
  renderCrepusNode,
  type CrepusNode,
  type RenderCrepusOptions,
} from "./render";

// Re-export so CLI emit can depend on one package.
export { createSignal, createMemo, createStore } from "@tschk/moonshine";
export {
  createApp,
  createMoonshineApp,
  useSignal,
} from "@tschk/moonshine/react";
export { crepusRenderer } from "./framework";
