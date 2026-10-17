/** Explicit native error scope; does not construct a Vue application. */
import { createComponentScope, getOwner } from "@tschk/moonshine-dom/reactive";
import { componentErrorKey, type ComponentErrorHandler } from "./error-context";
export type {
  ComponentErrorHandler,
  ComponentErrorInfo,
  WatchErrorPhase,
} from "./error-context";
export function withComponentErrorHandler<T>(
  handler: ComponentErrorHandler,
  setup: () => T,
): T {
  if (typeof handler !== "function" || typeof setup !== "function")
    throw new TypeError("Error handler and setup must be functions");
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw Error("Component error scope requires a live owner");
  return createComponentScope(() => {
    const scope = getOwner()!;
    scope.context = new Map(scope.context);
    scope.context.set(componentErrorKey, handler);
    return setup();
  });
}
