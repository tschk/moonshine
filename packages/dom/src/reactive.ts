import { cleanupOrderKey, type CleanupPolicy } from "./cleanup-order";
export { cleanupOrderKey };
export type { CleanupPolicy };
import { renderSchedulerKey, type RenderScheduler } from "./render-scheduler";
/** Independent reactive primitives; compiled Solid DOM output is not supported. */
import { isTracking } from "@tschk/moonshine/tracking";
import {
  batch as moonshineBatch,
  createMemo as moonshineMemo,
  createSignal as moonshineSignal,
  untrack,
} from "@tschk/moonshine";

/** Internal scoped historical evaluation capability, never a live-owner substitute. */
export const cleanupComputationKey = /* @__PURE__ */ Symbol(
  "moonshine.cleanup.computation",
);
export function assertNotCleanupComputation(): void {
  if (owner?.context?.has(cleanupComputationKey))
    throw new Error(
      "effect_in_teardown: Cannot create owned work during cleanup computation",
    );
}

export type Accessor<T> = () => T;
export type Setter<T> = (value: T | ((previous: T) => T)) => T;
export type Owner = {
  parent: Owner | null;
  children: Set<Owner>;
  cleanups: Array<() => void>;
  disposed: boolean;
  disposing?: boolean;
  beforeDispose?: Array<() => void>;
  afterDispose?: Array<() => void>;
  context?: Map<symbol, unknown>;
  stop?: () => void;
};

let owner: Owner | null = null;
let rootDepth = 0;
let updateDepth = 0;
let cleanupDepth = 0;
let flushing = false;
let callbackDepth = 0;
let startupDepth = 0;
let pendingMicrotask = false;
let routedErrors = 0;
function deferPending(): void {
  if (pendingMicrotask) return;
  pendingMicrotask = true;
  queueMicrotask(() => {
    pendingMicrotask = false;
    flushPending();
  });
}
function invokeCallback<T>(fn: () => T): T {
  callbackDepth++;
  try {
    return fn();
  } finally {
    callbackDepth--;
  }
}
function subscribeTracked(tracked: {
  subscribe(fn: () => void): () => void;
}): () => void {
  startupDepth++;
  try {
    return tracked.subscribe(() => {});
  } finally {
    startupDepth--;
  }
}
const pending: Array<() => void> = [];

function flushPending(): void {
  if (
    !pending.length ||
    rootDepth ||
    updateDepth ||
    cleanupDepth ||
    flushing ||
    flushingCleanupFinalizers
  )
    return;
  if (callbackDepth || startupDepth || isTracking()) {
    deferPending();
    return;
  }
  flushing = true;
  let failed = false;
  let failure: unknown;
  try {
    while (pending.length) {
      for (const start of pending.splice(0)) {
        try {
          start();
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }
  } finally {
    flushing = false;
  }
  if (failed) throw failure;
}

function runUpdates<T>(fn: () => T): T {
  updateDepth++;
  let result!: T;
  let failed = false;
  let failure: unknown;
  try {
    result = fn();
  } catch (error) {
    failed = true;
    failure = error;
  }
  updateDepth--;
  try {
    flushPending();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  if (failed) throw failure;
  return result;
}

export const errorHandlerKey = /* @__PURE__ */ Symbol();
function routeHandler(scope: Owner): ((error: unknown) => boolean) | undefined {
  return scope.context?.get(errorHandlerKey) as
    ((error: unknown) => boolean) | undefined;
}

/** Internal queue seam for the opt-in error boundary implementation. */
export function queueErrorHandler(fn: () => void): void {
  routedErrors++;
  pending.push(() => {
    routedErrors--;
    fn();
  });
  if (!rootDepth && !updateDepth && !cleanupDepth && !flushing) deferPending();
}
export { createOwner as createErrorOwner };
export { catchError } from "./error";

function createOwner(): Owner {
  assertNotCleanupComputation();
  if (owner?.disposed)
    throw new Error("Cannot attach work to a disposed native owner");
  const scope: Owner = {
    parent: owner,
    children: new Set(),
    cleanups: [],
    disposed: false,
    context: owner?.context,
  };
  owner?.children.add(scope);
  return scope;
}

// One lazy notification for the optional physical-cleanup transaction implementation.
let cleanupFinalizerFlush: (() => void) | undefined;
let flushingCleanupFinalizers = false;
export function requestCleanupFinalizerFlush(flush: () => void): void {
  if (cleanupFinalizerFlush && cleanupFinalizerFlush !== flush)
    throw new Error("Conflicting native cleanup finalizer implementations");
  cleanupFinalizerFlush = flush;
}
function flushCleanupFinalizers(): void {
  if (cleanupDepth || flushingCleanupFinalizers) return;
  flushingCleanupFinalizers = true;
  let first: unknown,
    failed = false;
  let waves = 0;
  try {
    while (cleanupFinalizerFlush) {
      if (++waves > 1000) {
        cleanupFinalizerFlush = undefined;
        if (!failed)
          first = new Error("Native cleanup finalizer update limit exceeded");
        failed = true;
        break;
      }
      const flush = cleanupFinalizerFlush;
      cleanupFinalizerFlush = undefined;
      try {
        flush();
      } catch (error) {
        if (!failed) first = error;
        failed = true;
      }
    }
  } finally {
    flushingCleanupFinalizers = false;
  }
  if (failed) throw first;
}

/** Internal bracket for opted physical cleanup outside an owner disposal. */
export function withCleanupTransaction(fn: () => void): void {
  let failed = false;
  let failure: unknown;
  cleanupDepth++;
  try {
    fn();
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    cleanupDepth--;
  }
  try {
    flushCleanupFinalizers();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  try {
    flushPending();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  if (failed) throw failure;
}

/** Read-only seam for an optional cleanup policy's fixed physical finalizers. */
export function cleanupTransactionActive(): boolean {
  return cleanupDepth > 0;
}

function clean(scope: Owner): void {
  if (scope.children.size === 0 && scope.cleanups.length === 0) return;
  cleanupDepth++;
  const policy = scope.context?.get(cleanupOrderKey) as
    CleanupPolicy | undefined;
  let failure: unknown;
  let failed = false;
  try {
    const children = Array.from(
      scope.children,
      (child) => () => dispose(child),
    );
    const cleanups = scope.cleanups.splice(0);
    if (policy?.reverse) {
      children.reverse();
      cleanups.reverse();
    }
    for (const callback of [...children, ...cleanups]) {
      try {
        untrack(callback);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
  } finally {
    cleanupDepth--;
  }
  try {
    flushCleanupFinalizers();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  try {
    flushPending();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  if (failed) throw failure;
}

function dispose(scope: Owner): void {
  if (scope.disposed || scope.disposing) return;
  scope.disposing = true;
  cleanupDepth++;
  let failed = false;
  let failure: unknown;
  try {
    if (scope.beforeDispose) {
      for (const callback of scope.beforeDispose.splice(0)) {
        try {
          runWithOwner(scope, () => untrack(callback));
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }
    scope.disposed = true;
    scope.parent?.children.delete(scope);
    try {
      clean(scope);
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
    try {
      scope.stop?.();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
    if (scope.afterDispose) {
      for (const callback of scope.afterDispose.splice(0))
        pending.push(() => runWithOwner(scope, () => untrack(callback)));
    }
  } finally {
    // Scoped cleanup computations retain their capability until their finally exits.
    if (!scope.context?.has(cleanupComputationKey)) scope.context = undefined;
    scope.disposing = false;
    cleanupDepth--;
  }
  try {
    flushCleanupFinalizers();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  try {
    flushPending();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  if (failed) throw failure;
}

/** Schedule after the current native root/update and complete cleanup commit. */
export function queuePostCommit(fn: () => void): void {
  pending.push(fn);
  if (!rootDepth && !updateDepth && !cleanupDepth && !flushing)
    queueMicrotask(flushPending);
}
function lifecycleOwner(hook: string): Owner {
  assertNotCleanupComputation();
  if (
    !owner ||
    owner.disposed ||
    (owner.disposing && hook !== "onAfterDispose")
  )
    throw new Error(`${hook} requires a live native owner`);
  return owner;
}
/** Final disposal only; executes untracked before owned work is stopped. */
export function onBeforeDispose(fn: () => void): void {
  (lifecycleOwner("onBeforeDispose").beforeDispose ??= []).push(fn);
}
/** Final disposal only; child-first after cleanup; before-disposal hooks may register it. */
export function onAfterDispose(fn: () => void): void {
  (lifecycleOwner("onAfterDispose").afterDispose ??= []).push(fn);
}

export function getOwner(): Owner | null {
  return owner;
}

export function runWithOwner<T>(scope: Owner | null, fn: () => T): T {
  const previous = owner;
  owner = scope;
  try {
    return fn();
  } finally {
    owner = previous;
  }
}

/** Attached component setup: isolate dependencies and dispose failed owned work. */
export function createComponentScope<T>(fn: () => T): T {
  return invokeCallback(() => {
    const scope = createOwner();
    try {
      return runWithOwner(scope, () => untrack(fn));
    } catch (error) {
      const target = routeHandler(scope);
      try {
        dispose(scope);
      } catch {
        /* Preserve setup failure. */
      }
      if (target?.(error)) return undefined as T;
      throw error;
    }
  });
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  assertNotCleanupComputation();
  // Successfully created roots require explicit disposal.
  const context = owner?.context;
  const scope = runWithOwner(null, createOwner);
  scope.context = context;
  rootDepth++;
  let result!: T;
  let failure: unknown;
  let failed = false;
  try {
    result = runWithOwner(scope, () => untrack(() => fn(() => dispose(scope))));
  } catch (error) {
    failure = error;
    failed = true;
    try {
      dispose(scope);
    } catch {
      // Preserve the callback failure after attempting every owned cleanup.
    }
  }
  rootDepth--;
  try {
    flushPending();
  } catch (error) {
    if (!failed) failure = error;
    failed = true;
  }
  if (failed) throw failure;
  return result;
}

export function onCleanup<T extends () => void>(fn: T): T {
  assertNotCleanupComputation();
  if (owner && !owner.disposed) owner.cleanups.push(fn);
  return fn;
}

export function createSignal<T>(
  initial: T,
  options: { equals?: false | ((previous: T, next: T) => boolean) } = {},
): [Accessor<T>, Setter<T>] {
  let value = initial;
  const version = moonshineSignal(0);
  const equals =
    options.equals === undefined
      ? (previous: T, next: T) => previous === next
      : options.equals;
  return [
    () => {
      version();
      return value;
    },
    (next) =>
      runUpdates(() => {
        const resolved =
          typeof next === "function"
            ? (next as (previous: T) => T)(value)
            : next;
        if (equals && equals(value, resolved)) return resolved;
        value = resolved;
        version.set(version.peek() + 1);
        return value;
      }),
  ];
}

/** Preserve the callback result, which the signal kernel's batch discards. */
export function batch<T>(fn: () => T): T {
  return runUpdates(() => {
    let result!: T;
    moonshineBatch(() => {
      result = fn();
    });
    return result;
  });
}

function computation<T>(
  fn: (previous: T) => T,
  initial: T,
  deferred: boolean,
): void {
  const scope = createOwner();
  let previous = initial;
  const start = () => {
    if (scope.disposed) return;
    const tracked = moonshineMemo(() =>
      invokeCallback(() => {
        if (scope.disposed) return;
        untrack(() => clean(scope));
        try {
          previous = runWithOwner(scope, () => fn(previous));
        } catch (error) {
          try {
            clean(scope);
          } catch {
            // Preserve the computation failure after attempting every cleanup.
          }
          if (!routeHandler(scope)?.(error)) throw error;
        }
      }),
    );
    try {
      scope.stop = subscribeTracked(tracked);
    } catch (error) {
      try {
        dispose(scope);
      } catch {
        // Preserve the computation failure when cleanup also fails.
      }
      throw error;
    }
    if (scope.disposed) scope.stop();
    if (routedErrors) flushPending();
  };
  if (!deferred) start();
  else if (rootDepth > 0 || updateDepth > 0 || cleanupDepth > 0 || flushing)
    pending.push(start);
  else queueMicrotask(start);
}

export function createEffect<T>(fn: (previous: T) => T, initial: T): void;
export function createEffect(fn: (previous: undefined) => unknown): void;
export function createEffect<T>(fn: (previous: T) => T, initial?: T): void {
  computation(fn, initial as T, true);
}

export function createComputed<T>(fn: (previous: T) => T, initial: T): void;
export function createComputed(fn: (previous: undefined) => unknown): void;
export function createComputed<T>(fn: (previous: T) => T, initial?: T): void {
  computation(fn, initial as T, false);
}

export function getRenderScheduler(): RenderScheduler | undefined {
  return owner?.context?.get(renderSchedulerKey) as RenderScheduler | undefined;
}
export function createRenderEffect<T>(
  fn: (previous: T) => T,
  initial?: T,
): void {
  const scheduler = getRenderScheduler();
  if (scheduler) scheduler.effect(fn, initial as T);
  else computation(fn, initial as T, false);
}
export const createRenderMemo: typeof createMemo = ((
  fn: any,
  initial: any,
  options: any,
) => {
  const scheduler = getRenderScheduler();
  return scheduler
    ? scheduler.memo(fn, initial, options)
    : createMemo(fn, initial, options);
}) as typeof createMemo;

export function createMemo<T>(
  fn: (previous: T) => T,
  initial: T,
  options?: { equals?: false | ((previous: T, next: T) => boolean) },
): Accessor<T>;
export function createMemo<T>(
  fn: (previous: T | undefined) => T,
  initial?: undefined,
  options?: { equals?: false | ((previous: T, next: T) => boolean) },
): Accessor<T>;
export function createMemo<T>(
  fn: (previous: T) => T,
  initial?: T,
  options: { equals?: false | ((previous: T, next: T) => boolean) } = {},
): Accessor<T> {
  const scope = createOwner();
  const active = moonshineSignal(true);
  let current = { value: initial as T };
  let initialized = false;
  const equals =
    options.equals === undefined
      ? (previous: T, next: T) => previous === next
      : options.equals;
  const tracked = moonshineMemo(() =>
    invokeCallback(() => {
      if (!active() || scope.disposed) return current;
      untrack(() => clean(scope));
      let next: T;
      try {
        next = runWithOwner(scope, () => fn(current.value));
      } catch (error) {
        try {
          clean(scope);
        } catch {
          // Preserve the memo failure after attempting every owned cleanup.
        }
        if (routeHandler(scope)?.(error)) return current;
        throw error;
      }
      if (!initialized || !equals || !equals(current.value, next)) {
        current = { value: next };
      }
      initialized = true;
      return current;
    }),
  );
  let stop: () => void;
  try {
    stop = subscribeTracked(tracked);
  } catch (error) {
    try {
      dispose(scope);
    } catch {
      // Preserve the initial memo failure when cleanup also fails.
    }
    throw error;
  }
  scope.stop = () => {
    stop();
    active.set(false);
    tracked.peek();
  };
  if (scope.disposed) scope.stop();
  if (routedErrors) flushPending();
  return () => (scope.disposed ? current.value : tracked().value);
}

export function onMount(fn: () => void): void {
  createEffect(() => untrack(fn));
}

export { untrack };

type OnInputs<T extends readonly Accessor<unknown>[]> = {
  [K in keyof T]: ReturnType<T[K]>;
};
type OnCallback<Input, Value> = (
  input: Input,
  previousInput: Input | undefined,
  previousValue: NoInfer<Value> | undefined,
) => Value;
export function on<Input, Value>(
  dependencies: Accessor<Input>,
  fn: OnCallback<Input, Value>,
  options?: { defer?: false },
): (previousValue: Value | undefined) => Value;
export function on<const Inputs extends readonly Accessor<unknown>[], Value>(
  dependencies: Inputs,
  fn: OnCallback<OnInputs<Inputs>, Value>,
  options?: { defer?: false },
): (previousValue: Value | undefined) => Value;
export function on<Input, Value>(
  dependencies: Accessor<Input>,
  fn: OnCallback<Input, Value>,
  options: { defer?: boolean },
): (previousValue: Value | undefined) => Value | undefined;
export function on<const Inputs extends readonly Accessor<unknown>[], Value>(
  dependencies: Inputs,
  fn: OnCallback<OnInputs<Inputs>, Value>,
  options: { defer?: boolean },
): (previousValue: Value | undefined) => Value | undefined;
/** Track only explicit inputs; callback reads and writes do not add dependencies. */
export function on(
  dependencies: Accessor<unknown> | readonly Accessor<unknown>[],
  fn: (input: any, previousInput: any, previousValue: any) => unknown,
  options: { defer?: boolean } = {},
): (previousValue: unknown) => unknown {
  let previousInput: unknown;
  let deferred = options.defer;
  return (previousValue) => {
    const input =
      typeof dependencies === "function"
        ? dependencies()
        : dependencies.map((dependency) => dependency());
    if (deferred) {
      deferred = false;
      return previousValue;
    }
    const value = untrack(() => fn(input, previousInput, previousValue));
    previousInput = input;
    return value;
  };
}

export { templateRetentionKey } from "./template-retention";
