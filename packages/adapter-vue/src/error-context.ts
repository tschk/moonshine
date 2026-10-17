/** Private callback policy; no Vue app/public-instance ABI. */
import {
  peekComponentContext,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { getOwner, untrack } from "@tschk/moonshine-dom/reactive";
export type WatchErrorPhase =
  "watch getter" | "watch callback" | "watch effect" | "watch cleanup";
export type ComponentErrorInfo = {
  readonly component: ComponentContext | undefined;
  readonly phase: WatchErrorPhase;
};
export type ComponentErrorHandler = (
  error: unknown,
  info: ComponentErrorInfo,
) => void;
export type ErrorDispatcher = (error: unknown, phase: WatchErrorPhase) => void;
export const componentErrorKey = /* @__PURE__ */ Symbol(
  "moonshine.vue.callback-error",
);
export function captureWatchErrorHandler(): ErrorDispatcher | undefined {
  const handler = getOwner()?.context?.get(componentErrorKey) as
    ComponentErrorHandler | undefined;
  if (!handler) return;
  const component = peekComponentContext();
  return (error, phase) => {
    try {
      untrack(() => handler(error, { component, phase }));
    } catch (secondary) {
      console.error(secondary);
    }
  };
}
export function invokeWatch<T>(
  report: ErrorDispatcher,
  phase: WatchErrorPhase,
  fn: () => T,
): T | undefined {
  let result: T;
  try {
    result = fn();
  } catch (error) {
    report(error, phase);
    return;
  }
  // Attach outside the user-call guard: a throwing .catch method must escape.
  if (
    result !== null &&
    (typeof result === "object" || typeof result === "function") &&
    typeof (result as { then?: unknown }).then === "function" &&
    typeof (result as { catch?: unknown }).catch === "function"
  )
    (
      result as unknown as { catch(reject: (error: unknown) => void): unknown }
    ).catch((error) => report(error, phase));
  return result;
}
