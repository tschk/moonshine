import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
/** Post-DOM native rune effects; opt-in pre/render phases live on /pre. */
import {
  collectDeps,
  subscribeInvalidation,
  type Trackable,
} from "@tschk/moonshine/tracking";
import {
  createRoot,
  getRenderScheduler,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { flushComponentReferences } from "@tschk/moonshine-dom/component-instance";

import { holdHistory, releaseHistory, withHistoryCleanup } from "./history";
import { notifyTrackableUnsubscribe } from "./store-demand";
import { queueTickWork, removeTickWork } from "./tick-queue";
import {
  createAbortContext,
  withAbortContext,
  withoutAbortContext,
} from "./abort-signal";

const pending = new Set<() => void>();
let scheduled = false,
  epoch = 0;
function flush(): void {
  removeTickWork(flush);
  let failed = false,
    failure: unknown;
  const runs = new Map<() => void, number>();
  try {
    while (pending.size) {
      try {
        flushComponentReferences();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
      if (!pending.size) break;
      const next = pending.values().next().value!;
      pending.delete(next);
      const count = (runs.get(next) ?? 0) + 1;
      runs.set(next, count);
      if (count > 1000) {
        if (!failed)
          failure = new Error("Native rune effect update limit exceeded");
        failed = true;
        continue;
      }
      try {
        next();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  } finally {
    scheduled = false;
    releaseHistory();
  }
  if (failed) throw failure;
}

function cancel(): void {
  pending.clear();
  if (scheduled) flush();
}

/** Untracked, manually disposed effect scope; deliberately independent of its caller. */
export function createRuneRoot(fn: () => void | (() => void)): () => void {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr")
    return () => {};
  return createRoot((stop) => {
    const scope = getOwner();
    const cleanup = fn();
    if (typeof cleanup === "function") {
      if (getOwner()?.disposed) withHistoryCleanup(() => untrack(cleanup));
      else onCleanup(cleanup);
    }
    return () => runWithOwner(scope, () => withHistoryCleanup(stop));
  });
}

/** Initial and invalidated callbacks run in a deduplicated microtask after DOM updates. */
export function createRuneEffect(fn: () => void | (() => void)): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Rune effects require a live native owner");
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return;
  const scheduler = getRenderScheduler();
  const effectPending = scheduler ? new Set<() => void>() : pending;
  const scheduledRun = scheduler
    ? () => {
        effectPending.delete(run);
        run();
      }
    : run;
  let disposed = false,
    stopRun: (() => void) | undefined;
  let subscriptions = new Map<Trackable, () => void>();
  let lastVersions: Map<Trackable, number> | undefined;
  let forced = false;
  function enqueue(): void {
    if (disposed || owner!.disposed) return;
    effectPending.add(run);
    if (scheduler) {
      scheduler.post(scheduledRun);
      return;
    }
    if (!scheduled) {
      scheduled = true;
      holdHistory();
      queueTickWork(flush, cancel);
      const token = ++epoch;
      queueMicrotask(() => {
        if (scheduled && token === epoch) flush();
      });
    }
  }
  function run(): void {
    if (disposed || owner!.disposed) return;
    if (lastVersions && !forced) {
      let changed = false;
      runWithOwner(owner, () =>
        untrack(() => {
          for (const [dep, version] of lastVersions!) {
            dep.validate?.();
            if (dep.version !== version) changed = true;
          }
        }),
      );
      if (!changed) return;
    }
    forced = false;
    const previous = stopRun;
    stopRun = undefined;
    if (previous) untrack(previous);
    const cleanupInvalidated = effectPending.has(run);
    let failed = false,
      failure: unknown;
    const versions = new Map<Trackable, number>();
    let dependencies: Trackable[] = [];
    runWithOwner(owner, () =>
      createRoot((stop) => {
        const scope = getOwner();
        const abortCtx = createAbortContext();
        onCleanup(() => abortCtx.abort());
        stopRun = () => {
          abortCtx.abort();
          runWithOwner(scope, () => withHistoryCleanup(stop));
        };
        dependencies = collectDeps(
          () => {
            try {
              const cleanup = withAbortContext(abortCtx, fn);
              if (typeof cleanup === "function") {
                if (getOwner()?.disposed)
                  withHistoryCleanup(() =>
                    untrack(() => withoutAbortContext(cleanup as () => void)),
                  );
                else
                  onCleanup(() => withoutAbortContext(cleanup as () => void));
              }
            } catch (error) {
              failed = true;
              failure = error;
            }
          },
          (dependency) => versions.set(dependency, dependency.version),
        );
      }),
    );
    if (disposed || owner!.disposed) {
      const cleanup = stopRun as (() => void) | undefined;
      stopRun = undefined;
      untrack(() => cleanup?.());
      notifyTrackableUnsubscribe();
      if (failed) throw failure;
      return;
    }
    const next = new Map<Trackable, () => void>();
    try {
      untrack(() => {
        for (const dependency of dependencies)
          next.set(
            dependency,
            subscriptions.get(dependency) ??
              subscribeInvalidation(dependency, {
                invalidate() {},
                notify: enqueue,
              }),
          );
        for (const [dependency, unsubscribe] of subscriptions)
          if (!next.has(dependency)) {
            unsubscribe();
            notifyTrackableUnsubscribe();
          }
      });
      subscriptions = next;
    } catch (error) {
      for (const [dependency, unsubscribe] of next)
        if (!subscriptions.has(dependency)) unsubscribe();
      notifyTrackableUnsubscribe();
      if (!failed) failure = error;
      failed = true;
    }
    // Cleanup writes retain their queued rerun even if setup drops that dependency.
    // Setup-only old branch invalidations are discarded; current self-writes rerun.
    effectPending.delete(run);
    lastVersions = versions;
    if (cleanupInvalidated) forced = true;
    if (
      cleanupInvalidated ||
      dependencies.some(
        (dependency) => dependency.version !== versions.get(dependency),
      )
    )
      enqueue();
    if (failed) {
      const cleanup = stopRun as (() => void) | undefined;
      stopRun = undefined;
      try {
        cleanup?.();
      } catch {
        /* Preserve callback/subscription failure. */
      }
      throw failure;
    }
  }
  onCleanup(() => {
    disposed = true;
    effectPending.delete(run);
    let failed = false,
      failure: unknown;
    for (const cleanup of [
      ...subscriptions.values(),
      ...(stopRun ? [stopRun] : []),
    ]) {
      try {
        untrack(cleanup);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    subscriptions.clear();
    stopRun = undefined;
    notifyTrackableUnsubscribe();
    if (failed) throw failure;
  });
  enqueue();
}

/** Query synchronous tracking only; ownership alone does not imply tracking. */
export { isTracking as runeTracking } from "@tschk/moonshine/tracking";
