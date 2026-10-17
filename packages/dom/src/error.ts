/** Optional native DOM/accessor error boundaries; SSR is unsupported. */
import {
  createErrorOwner,
  errorHandlerKey,
  queueErrorHandler,
  runWithOwner,
  createSignal,
  createRenderMemo,
  untrack,
  type Accessor,
} from "./reactive";
function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "Unknown error", {
        cause: error,
      });
}
export function catchError<T>(
  fn: () => T,
  handler: (error: Error) => void,
): T | undefined {
  const scope = createErrorOwner();
  const parent = scope.context?.get(errorHandlerKey) as
    ((error: unknown) => boolean) | undefined;
  const route = (error: unknown): boolean => {
    if (scope.disposed) return parent?.(error) ?? false;
    const normalized = normalizeError(error);
    queueErrorHandler(() => {
      if (scope.disposed) return;
      try {
        runWithOwner(scope, () => untrack(() => handler(normalized)));
      } catch (failure) {
        if (!parent?.(failure)) throw normalizeError(failure);
      }
    });
    return true;
  };
  scope.context = new Map(scope.context);
  scope.context.set(errorHandlerKey, route);
  try {
    return runWithOwner(scope, fn);
  } catch (error) {
    route(error);
  }
}
/** DOM/accessor boundary only; no SSR serialization boundary is provided. */
export function ErrorBoundary<T>(props: {
  children: () => T;
  fallback: (error: Error, reset: () => void) => T;
}): Accessor<T | undefined> {
  const [error, setError] = createSignal<Error | undefined>(undefined);
  return createRenderMemo(() => {
    const failure = error();
    if (!failure) return catchError(props.children, setError);
    const fallback = props.fallback;
    return untrack(() => fallback(failure, () => setError(undefined)));
  });
}
