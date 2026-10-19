/** Compiler-facing server bindings; use explicit native SSR factories. */
export { createServerProp } from "./server-prop";
export { propsId } from "./prop-id";
export { getAbortSignal } from "./abort-signal";
export { afterRender, settle, untrack } from "@tschk/moonshine-dom/ssr";
export { spreadServerProps } from "./spread-props";
export {
  spreadServerEntries,
  spreadServerElement,
} from "./spread-element-server";
export {
  setStoreValue,
  mutateServerStore,
  updateStoreValue,
} from "./store-write";

import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import {
  createAbortContext,
  withAbortContext,
  type AbortContext,
} from "./abort-signal";

/** Server tick resolves without flushing another renderer's pending work. */
export async function tick(): Promise<void> {}

/** Server settled resolves without flushing another renderer's pending work. */
export async function settled(): Promise<void> {}

/** Server flushSync invokes its optional callback synchronously. */
export function flushSync<T = void>(fn?: () => T): T {
  if (fn !== undefined && typeof fn !== "function") {
    throw new TypeError("flushSync callback must be a function");
  }
  return fn ? fn() : (undefined as T);
}

/** Server state is a plain value box; function values are never invoked. */
export function createServerState<T>(value: T): { value: T } {
  return { value };
}

/** Capture render-time caching once. Component lowering passes true explicitly. */
export function createServerDerived<T>(
  compute: () => T,
  cache = isSSRRendering() || peekComponentContext()?.mode === "ssr",
): { value: T } {
  let ready = false;
  let cached!: T, updated: T | undefined;
  let abortCtx: AbortContext | undefined;
  const evaluate = (): T => {
    abortCtx?.abort();
    const runAbortCtx = createAbortContext();
    abortCtx = runAbortCtx;
    try {
      return withAbortContext(runAbortCtx, compute);
    } catch (error) {
      runAbortCtx.abort();
      throw error;
    }
  };
  return {
    get value() {
      if (updated != null) return updated;
      if (!cache) return evaluate();
      if (!ready) {
        cached = evaluate();
        ready = true;
      }
      return cached;
    },
    set value(value: T) {
      abortCtx?.abort();
      updated = value;
    },
  };
}

export { createServerStoreReferences } from "./server-store";

export type {
  ServerStoreReference,
  ServerStoreReferences,
} from "./server-store";
