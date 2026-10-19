/** Scoped AbortSignal tracking for native Svelte effects and derived computations. */

export type AbortContext = {
  controller?: AbortController;
  aborted: boolean;
  abort(): void;
};

let currentAbortContext: AbortContext | undefined;

export function createAbortContext(): AbortContext {
  const ctx: AbortContext = {
    aborted: false,
    abort() {
      if (ctx.aborted) return;
      ctx.aborted = true;
      ctx.controller?.abort();
    },
  };
  return ctx;
}

export function withAbortContext<T>(ctx: AbortContext, fn: () => T): T {
  const prev = currentAbortContext;
  currentAbortContext = ctx;
  try {
    return fn();
  } finally {
    currentAbortContext = prev;
  }
}

export function withoutAbortContext<T>(fn: () => T): T {
  const prev = currentAbortContext;
  currentAbortContext = undefined;
  try {
    return fn();
  } finally {
    currentAbortContext = prev;
  }
}

/**
 * Return an `AbortSignal` that aborts when the current native effect or derived
 * computation re-runs or is disposed.
 */
export function getAbortSignal(): AbortSignal {
  if (!currentAbortContext) {
    throw new Error(
      "getAbortSignal() can only be called inside an effect or derived",
    );
  }
  if (!currentAbortContext.controller) {
    currentAbortContext.controller = new AbortController();
    if (currentAbortContext.aborted) {
      currentAbortContext.controller.abort();
    }
  }
  return currentAbortContext.controller.signal;
}
