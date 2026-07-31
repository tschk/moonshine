/** View IR document types — `ViewIr` is the emit/CLI alias for `CrepusIr`. */
export type { CrepusIr, ViewIr } from "./types";

export {
  renderCrepusIr,
  renderCrepusNode,
  type CrepusNode,
  type RenderCrepusOptions,
} from "./render";

export type * from "./types";

export {
  asArray,
  badgeToneStyle,
  bindItemTemplate,
  sparklinePath,
  sparklinePoints,
  styleOf,
  BADGE_TONE_COLORS,
} from "./ir-shared";

// Re-export so CLI emit can depend on one package.
export { createSignal, createMemo, createStore } from "@tschk/moonshine";
export {
  createApp,
  createMoonshineApp,
  useSignal,
} from "@tschk/moonshine/react";
export { crepusRenderer } from "./framework";
