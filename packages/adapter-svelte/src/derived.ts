/** Lazy native derived values with writable optimistic overrides. */
import { createMemo, createSignal, untrack } from "@tschk/moonshine";
import {
  collectDeps,
  subscribeInvalidation,
  trackDependency,
  hasValueDemand,
  type Trackable,
} from "@tschk/moonshine/tracking";
import {
  getOwner,
  onCleanup,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";

import {
  collectHistoryReads,
  hasHistory,
  historicalValue,
  isHistoryReading,
  readHistory,
  recordHistory,
  trackHistoryRead,
  withHistoryCleanup,
  withHistoryMutation,
  type HistoryRead,
} from "./history";

export function createDerived<T>(fn: () => T): {
  get value(): T;
  set value(value: T);
} {
  const owner = getOwner();
  if (owner?.disposed)
    throw new Error("Cannot create a derived value in a disposed owner");
  const invalidation = createSignal(0);
  const token = {};
  let reads: HistoryRead[] = [];
  let baseValue!: T;
  type Snapshot = { value: T } | undefined;
  function snapshot(): Snapshot {
    return overridden
      ? { value: override }
      : returned
        ? { value: last }
        : undefined;
  }
  let initialized = false,
    overridden = false,
    disposed = false,
    returned = false,
    overrideInvalidated = false;
  let inputRevision = 0;
  let memoDependency: Trackable | undefined;
  let overrideVersions = new Map<Trackable, number>();
  let override!: T, last!: T;
  let subscriptions = new Map<Trackable, () => void>();
  function invalidate(): void {
    if (disposed) return;
    // Invalidating a committed override restores the previous computed inputs.
    // A same-flush assignment already recorded its earlier value, which wins.
    if (overridden) recordHistory(token, "override", undefined, undefined);
    overrideInvalidated = true;
    inputRevision++;
  }
  // Preserve the kernel dependency graph for pull validation and diamond updates.
  // Side observers mark input changes without turning observation into value demand.
  // Only a changed base computation resets an optimistic override.
  const base = createMemo(() => {
    let next!: T,
      failed = false,
      failure: unknown;
    const versions = new Map<Trackable, number>();
    const dependencies = collectDeps(
      () => {
        try {
          const collected = collectHistoryReads(() => runWithOwner(owner, fn));
          next = collected.value;
          reads = collected.reads;
        } catch (error) {
          failed = true;
          failure = error;
        }
      },
      (dependency) => versions.set(dependency, dependency.version),
      true,
    );
    const nextSubscriptions = new Map<Trackable, () => void>();
    try {
      untrack(() => {
        for (const dependency of dependencies)
          nextSubscriptions.set(
            dependency,
            subscriptions.get(dependency) ??
              subscribeInvalidation(dependency, {
                demand: false,
                invalidate,
                notify() {
                  if (!disposed) invalidation.set((previous) => previous + 1);
                },
              }),
          );
        for (const [dependency, unsubscribe] of subscriptions)
          if (!nextSubscriptions.has(dependency)) unsubscribe();
      });
    } catch (error) {
      for (const [dependency, unsubscribe] of nextSubscriptions)
        if (!subscriptions.has(dependency)) unsubscribe();
      if (!failed) failure = error;
      failed = true;
    }
    subscriptions = nextSubscriptions;
    if (failed) throw failure;
    if (
      dependencies.some(
        (dependency) => dependency.version !== versions.get(dependency),
      )
    )
      throw new Error("Derived computations must not write their dependencies");
    // Pull validation can run before this dependency's queued notification.
    // Reset here too so optimistic siblings cannot expose a stale override.
    if (initialized) {
      if (hasHistory(reads))
        recordHistory(token, "override", undefined, undefined);
      overridden = false;
    }
    initialized = true;
    baseValue = next;
    return next;
  });
  let baseDependency: Parameters<typeof trackDependency>[0] | undefined;
  const baseView: Parameters<typeof trackDependency>[0] = {
    get version() {
      return inputRevision;
    },
    validate() {},
    subscribe: (
      ...args: Parameters<Parameters<typeof trackDependency>[0]["subscribe"]>
    ) => baseDependency!.subscribe(...args),
  };
  const memo = createMemo(() => {
    invalidation();
    let computed!: T;
    if (overridden && initialized && !overrideInvalidated && baseDependency) {
      computed = override;
    } else if (baseDependency) computed = untrack(base);
    else {
      const dependencies = collectDeps(() => {
        computed = base();
      });
      baseDependency = dependencies[0] as Parameters<typeof trackDependency>[0];
    }
    trackDependency(baseView);
    overrideInvalidated = false;
    last = overridden ? override : computed;
    returned = true;
    return last;
  });
  if (owner)
    onCleanup(() => {
      disposed = true;
      for (const unsubscribe of subscriptions.values()) untrack(unsubscribe);
      subscriptions.clear();
    });
  let frozenFailure = false,
    frozenError: unknown;
  return {
    get value() {
      trackHistoryRead(token, "override");
      for (const read of reads) trackHistoryRead(read.target, read.key);
      if (isHistoryReading())
        return historicalValue(token, () =>
          untrack(() => {
            let recorded = true;
            const previous = readHistory<Snapshot>(token, "override", () => {
              recorded = false;
              return undefined;
            });
            if (previous) return previous.value;
            if (initialized && !hasHistory(reads))
              return !recorded && overridden ? override : baseValue;
            return runWithOwner(owner, () => withHistoryCleanup(fn));
          }),
        );
      if (disposed) {
        if (frozenFailure) throw frozenError;
        if (returned) return last;
        if (overridden) return override;
        // A never-read value may finish once after its owner has stopped, without
        // reconnecting the disposed memo or retaining dependency subscriptions.
        frozenFailure = true;
        frozenError = new Error(
          "Derived value read during its disposed evaluation",
        );
        const versions = new Map<Trackable, number>();
        let next!: T;
        try {
          const dependencies = untrack(() =>
            collectDeps(
              () => {
                next = runWithOwner(owner, fn);
              },
              (dependency) => versions.set(dependency, dependency.version),
            ),
          );
          if (
            dependencies.some(
              (dependency) => dependency.version !== versions.get(dependency),
            )
          )
            throw new Error(
              "Derived computations must not write their dependencies",
            );
          frozenFailure = false;
          last = baseValue = next;
          returned = initialized = true;
          return next;
        } catch (error) {
          frozenFailure = true;
          frozenError = error;
          throw error;
        }
      }
      if (
        overridden &&
        initialized &&
        memoDependency &&
        !hasValueDemand(memoDependency)
      ) {
        let changed = false;
        untrack(() => {
          for (const [dependency, version] of overrideVersions) {
            dependency.validate?.();
            if (dependency.version !== version) changed = true;
          }
        });
        if (changed && !overrideInvalidated) {
          overrideInvalidated = true;
          inputRevision++;
          invalidation.set((previous) => previous + 1);
        }
      }
      if (!memoDependency) {
        let value!: T;
        collectDeps(
          () => {
            value = memo();
          },
          (dependency) => {
            memoDependency = dependency;
          },
          true,
        );
        return value;
      }
      return memo();
    },
    set value(value: T) {
      if (disposed) throw new Error("Cannot override a disposed derived value");
      withHistoryMutation(() => {
        if (!initialized) untrack(base);
        recordHistory(token, "override", snapshot(), { value });
        overrideVersions = new Map(
          [...subscriptions.keys()].map((dependency) => [
            dependency,
            dependency.version,
          ]),
        );
        overrideInvalidated = false;
        override = value;
        overridden = true;
        invalidation.set((previous) => previous + 1);
      });
    },
  };
}
