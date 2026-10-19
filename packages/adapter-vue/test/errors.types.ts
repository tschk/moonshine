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

import {
  onBeforeMount,
  onErrorCaptured,
  type ErrorCapturedHook,
} from "@tschk/moonshine-vue/lifecycle";
import { useId } from "@tschk/moonshine-vue/context";

const typedHook: ErrorCapturedHook<Error> = (err, instance, info) => {
  const msg: string = err.message;
  const frame: ComponentContext | undefined = instance;
  const phase: WatchErrorPhase = info;
  void [msg, frame, phase];
  return false;
};
if (false as boolean) {
  onBeforeMount(() => {});
  onErrorCaptured(typedHook);
  const generatedId: string = useId();
  void generatedId;
  // @ts-expect-error onErrorCaptured return must be boolean | void
  onErrorCaptured(() => "invalid");
}
