/** Private callback policy; no Vue app/public-instance ABI. */
import {
  peekComponentContext,
  setContext,
  withComponentConsumer,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { getOwner, runWithOwner, untrack } from "@tschk/moonshine-dom/reactive";
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
export type ErrorCapturedHook<TError = unknown> = (
  err: TError,
  instance: ComponentContext | undefined,
  info: WatchErrorPhase,
) => boolean | void;
export type ErrorDispatcher = (error: unknown, phase: WatchErrorPhase) => void;
export const componentErrorKey = /* @__PURE__ */ Symbol(
  "moonshine.vue.callback-error",
);
const errorCapturesKey = /* @__PURE__ */ Symbol("moonshine.vue.error-captures");
type ErrorCaptureLayer = {
  frame: ComponentContext;
  parent?: ErrorCaptureLayer;
  hooks: Array<ErrorCapturedHook<any>>;
};
export function registerErrorCaptured(
  frame: ComponentContext,
  hook: ErrorCapturedHook<any>,
): void {
  let current = frame.contexts.get(errorCapturesKey) as
    ErrorCaptureLayer | undefined;
  if (current?.frame !== frame) {
    current = { frame, parent: current, hooks: [] };
    setContext(errorCapturesKey, current);
  }
  current.hooks.push(hook);
}
export function captureWatchErrorHandler(): ErrorDispatcher | undefined {
  const handler = getOwner()?.context?.get(componentErrorKey) as
    ComponentErrorHandler | undefined;
  const component = peekComponentContext();
  let captures = component?.contexts.get(errorCapturesKey) as
    ErrorCaptureLayer | undefined;
  if (captures && captures.frame === component) captures = captures.parent;
  if (!handler && !captures) return;
  return (error, phase) => {
    let currentError: unknown = error;
    for (let layer = captures; layer; layer = layer.parent) {
      if (layer.frame.owner.disposed) continue;
      for (const hook of layer.hooks.slice()) {
        if (layer.frame.owner.disposed) break;
        let stopPropagation: boolean | void;
        try {
          stopPropagation = runWithOwner(layer.frame.owner, () =>
            untrack(() =>
              withComponentConsumer(layer.frame, () =>
                hook(currentError, component, phase),
              ),
            ),
          );
        } catch (secondary) {
          currentError = secondary;
          continue;
        }
        if (stopPropagation === false) return;
      }
    }
    if (!handler) throw currentError;
    try {
      untrack(() => handler(currentError, { component, phase }));
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
