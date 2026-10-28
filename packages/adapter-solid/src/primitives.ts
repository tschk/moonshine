/** Independent Solid secondary reactive primitives on the native Moonshine graph. */
import { isTracking } from "@tschk/moonshine/tracking";
import {
  batch,
  createComputed,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
  type Accessor,
  type Owner,
  type Setter,
} from "@tschk/moonshine-dom/reactive";

const idCounters = /* @__PURE__ */ new WeakMap<Owner, { next: number }>();
let fallbackIdCounter = 0;

export function createUniqueId(): string {
  const owner = getOwner();
  if (!owner) return `cl-${fallbackIdCounter++}`;
  let root: Owner = owner;
  while (root.parent) root = root.parent;
  let state = idCounters.get(root);
  if (!state) {
    state = { next: 0 };
    idCounters.set(root, state);
  }
  return `cl-${state.next++}`;
}

export type EqualityCheckerFunction<T, U> = (a: U, b: T) => boolean;
const defaultEqual = (a: unknown, b: unknown): boolean => a === b;

export function createSelector<T, U = T>(
  source: Accessor<T>,
  fn: EqualityCheckerFunction<T, U> = defaultEqual,
): (key: U) => boolean {
  const subs = new Map<
    U,
    { count: number; read: Accessor<boolean>; write: Setter<boolean> }
  >();
  let current!: T;
  let initialized = false;
  createComputed((prev: T | undefined) => {
    const value = source();
    current = value;
    if (initialized) {
      for (const [key, entry] of subs.entries()) {
        const matched = Boolean(fn(key, value));
        if (matched !== Boolean(fn(key, prev as T))) {
          entry.write(matched);
        }
      }
    }
    initialized = true;
    return value;
  });
  return (key: U): boolean => {
    const owner = getOwner();
    if (isTracking() && owner && !owner.disposed) {
      let entry = subs.get(key);
      if (!entry) {
        const [read, write] = createSignal(Boolean(fn(key, current)));
        entry = { count: 0, read, write };
        subs.set(key, entry);
      }
      entry.count++;
      onCleanup(() => {
        if (--entry!.count === 0) subs.delete(key);
      });
      return entry.read();
    }
    return Boolean(fn(key, current));
  };
}

export function createReaction(
  onInvalidate: () => void,
): (tracking: () => void) => void {
  const parentOwner = getOwner();
  let stopCurrent: (() => void) | undefined;
  if (parentOwner && !parentOwner.disposed) {
    onCleanup(() => {
      stopCurrent?.();
      stopCurrent = undefined;
    });
  }
  return (tracking: () => void): void => {
    stopCurrent?.();
    stopCurrent = undefined;
    if (parentOwner?.disposed) return;
    runWithOwner(parentOwner, () => {
      createRoot((dispose) => {
        let first = true;
        let triggered = false;
        const currentStop = () => {
          if (stopCurrent === currentStop) stopCurrent = undefined;
          dispose();
        };
        stopCurrent = currentStop;
        createComputed(() => {
          if (first) {
            first = false;
            tracking();
            return;
          }
          if (triggered) return;
          triggered = true;
          currentStop();
          if (!parentOwner?.disposed) {
            runWithOwner(parentOwner, () => untrack(onInvalidate));
          }
        });
      });
    });
  };
}

export function createServerReaction(
  _onInvalidate: () => void,
): (tracking: () => void) => void {
  return () => {};
}

export type ObservableObserver<T> =
  | ((v: T) => void)
  | {
      next?: (v: T) => void;
      error?: (v: unknown) => void;
      complete?: () => void;
    };

export type Observable<T> = {
  subscribe(
    observer: ObservableObserver<T>,
  ): { unsubscribe(): void } | (() => void);
  [key: symbol]: (() => Observable<T>) | undefined;
};

const observableSymbol: symbol | "@@observable" =
  (Symbol as { observable?: symbol }).observable ?? "@@observable";

export function observable<T>(input: Accessor<T>): Observable<T> {
  return {
    subscribe(observer: ObservableObserver<T>) {
      if (
        (typeof observer !== "object" && typeof observer !== "function") ||
        observer === null
      ) {
        throw new TypeError("Expected the observer to be an object.");
      }
      const handler =
        typeof observer === "function"
          ? observer
          : observer.next && observer.next.bind(observer);
      if (!handler) {
        return { unsubscribe() {} };
      }
      const dispose = createRoot((disposer) => {
        createComputed(() => {
          const v = input();
          untrack(() => handler(v));
        });
        return disposer;
      });
      if (getOwner()) onCleanup(dispose);
      return {
        unsubscribe() {
          dispose();
        },
      };
    },
    [observableSymbol]() {
      return this;
    },
  };
}

export function from<T>(
  producer: Observable<T> | ((set: Setter<T>) => () => void),
  initialValue: T,
): Accessor<T>;
export function from<T>(
  producer: Observable<T> | ((set: Setter<T | undefined>) => () => void),
): Accessor<T | undefined>;
export function from<T>(
  producer: Observable<T> | ((set: Setter<T | undefined>) => () => void),
  initialValue: T | undefined = undefined,
): Accessor<T | undefined> {
  const [s, set] = createSignal<T | undefined>(initialValue, {
    equals: false,
  });
  if ("subscribe" in producer) {
    const unsub = producer.subscribe((v) => set(() => v));
    onCleanup(() => ("unsubscribe" in unsub ? unsub.unsubscribe() : unsub()));
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  return s;
}

export interface DeferredOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
  timeoutMs?: number;
}

export function createDeferred<T>(
  source: Accessor<T>,
  options?: DeferredOptions<T>,
): Accessor<T> {
  let initial!: T;
  let initialized = false;
  let latest!: T;
  let version = 0;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let setDeferred!: Setter<T>;

  if (getOwner()) {
    onCleanup(() => {
      disposed = true;
      version++;
      if (timerId !== undefined) {
        clearTimeout(timerId);
        timerId = undefined;
      }
    });
  }

  createComputed(() => {
    const next = source();
    latest = next;
    if (!initialized) {
      initialized = true;
      initial = next;
      return;
    }
    const token = ++version;
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
    const timeoutMs = options?.timeoutMs;
    if (timeoutMs !== undefined && timeoutMs > 0) {
      timerId = setTimeout(() => {
        timerId = undefined;
        if (!disposed && token === version) {
          setDeferred(() => latest);
        }
      }, timeoutMs);
    } else {
      queueMicrotask(() => {
        if (!disposed && token === version) {
          setDeferred(() => latest);
        }
      });
    }
  });

  const [deferred, write] = createSignal<T>(initial, {
    equals: options?.equals,
  });
  setDeferred = write;
  return deferred;
}

export function createServerDeferred<T>(
  source: Accessor<T>,
  options?: DeferredOptions<T>,
): Accessor<T> {
  return createMemo(source, undefined, { equals: options?.equals });
}

const [transitionPending, setTransitionPending] =
  /* @__PURE__ */ createSignal(false);
let activeTransitionCount = 0;

export type Transition = [
  Accessor<boolean>,
  (fn: () => unknown) => Promise<void>,
];

export function startTransition(fn: () => unknown): Promise<void> {
  const result = batch(() => fn());
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as PromiseLike<unknown>).then === "function"
  ) {
    activeTransitionCount++;
    setTransitionPending(true);
    return Promise.resolve(result).then(
      () => {
        if (--activeTransitionCount === 0) {
          setTransitionPending(false);
        }
      },
      (err) => {
        if (--activeTransitionCount === 0) {
          setTransitionPending(false);
        }
        throw err;
      },
    );
  }
  return Promise.resolve();
}

export function useTransition(): Transition {
  return [transitionPending, startTransition];
}

export const DEV:
  { writeSignal?: (node: unknown, value: unknown) => void } | undefined =
  undefined;

export interface ExternalSource {
  track: (fn: () => any) => any;
  dispose: () => void;
}

export type ExternalSourceFactory = (
  fn: () => any,
  trigger: () => void,
) => ExternalSource;

const externalSourceFactories: ExternalSourceFactory[] = [];

export function enableExternalSource(factory: ExternalSourceFactory): void {
  if (typeof factory === "function") {
    externalSourceFactories.push(factory);
  }
}

export function getExternalSourceFactories(): readonly ExternalSourceFactory[] {
  return externalSourceFactories;
}

const errorBoundaryResets = new Set<() => void>();

export function registerErrorBoundaryReset(reset: () => void): () => void {
  errorBoundaryResets.add(reset);
  return () => {
    errorBoundaryResets.delete(reset);
  };
}

export function resetErrorBoundaries(): void {
  batch(() => {
    for (const reset of Array.from(errorBoundaryResets)) {
      reset();
    }
  });
}

export interface SuspenseProps<T = unknown> {
  readonly fallback?: T;
  readonly children: T;
}

export function Suspense<T>(props: SuspenseProps<T>): Accessor<T | undefined> {
  return createMemo(() => {
    const out = props.children;
    return out !== undefined ? out : props.fallback;
  });
}

export interface SuspenseListProps<T = unknown> {
  readonly children: T;
  readonly revealOrder: "forwards" | "backwards" | "together";
  readonly tail?: "collapsed" | "hidden";
}

export function SuspenseList<T>(props: SuspenseListProps<T>): Accessor<T> {
  return createMemo(() => props.children);
}
