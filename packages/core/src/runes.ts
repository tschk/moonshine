/**
 * Svelte-inspired approachability sugar over moonshine signals.
 * Thin aliases — not real compiler runes.
 *
 * ```ts
 * import { state, derived, effect } from "@tschk/moonshine/runes";
 * ```
 */
import { collectDeps, createMemo, createSignal, type Memo, type Signal } from "./signal";

/** Alias for `createSignal` — readable `$state`-like naming. */
export function state<T>(initial: T): Signal<T> {
  return createSignal(initial);
}

/** Alias for `createMemo` — readable `$derived`-like naming. */
export function derived<T>(fn: () => T): Memo<T> {
  return createMemo(fn);
}

/**
 * Run `fn` now and again whenever tracked signal/memo/store deps change.
 * Returns an unsubscribe function.
 *
 * Dep tracking uses the same tracker as `createMemo` (reads during `fn`).
 */
export function effect(fn: () => void): () => void {
  let unsubs: Array<() => void> = [];
  let disposed = false;
  let scheduled = false;

  const run = () => {
    for (const u of unsubs.splice(0)) u();
    if (disposed) return;

    const deps = collectDeps(fn);
    for (const dep of deps) {
      unsubs.push(
        dep.subscribe(() => {
          if (disposed || scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            if (!disposed) run();
          });
        }),
      );
    }
  };

  run();

  return () => {
    disposed = true;
    for (const u of unsubs.splice(0)) u();
  };
}

export { createSignal, createMemo, createStore, batch, untrack } from "./signal";
export type { Signal, Memo, StoreSetter } from "./signal";
