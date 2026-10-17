import type { ComponentContext } from "@tschk/moonshine-dom/component";
import {
  withComponentErrorHandler,
  type ComponentErrorInfo,
  type WatchErrorPhase,
} from "@tschk/moonshine-vue/errors";
const result: number = withComponentErrorHandler(
  (error, info) => {
    const phase: WatchErrorPhase = info.phase;
    const frame: ComponentContext | undefined = info.component;
    void phase;
    void frame;
    // @ts-expect-error original thrown values are unknown, not normalized Error
    void error.message;
  },
  () => 42,
);
void result;
const bad: ComponentErrorInfo = {
  // @ts-expect-error no claim to Vue ComponentPublicInstance
  component: { $props: {} },
  phase: "watch callback",
};
void bad;

const phases: WatchErrorPhase[] = [
  "watch getter",
  "watch callback",
  "watch effect",
  "watch cleanup",
];
void phases;
// @ts-expect-error lifecycle/app errors are not supported watch phases
const unsupported: WatchErrorPhase = "mounted";
void unsupported;
