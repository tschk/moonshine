/** Host-free Angular signal primitives backed by the Moonshine reactive graph. */
import {
  createMemo as msCreateMemo,
  createSignal as msCreateSignal,
  untrack,
  type Signal as MsSignal,
} from "@tschk/moonshine";
import { collectDeps, type Trackable } from "@tschk/moonshine/tracking";
import {
  batch,
  createRoot,
  createSignal as createDomSignal,
  getOwner,
  onCleanup as domOnCleanup,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";

export type ValueEqualityFn<T> = (a: T, b: T) => boolean;

export interface CreateSignalOptions<T> {
  equal?: ValueEqualityFn<T>;
}

export interface CreateComputedOptions<T> {
  equal?: ValueEqualityFn<T>;
}

export interface LinkedSignalOptions<S, D> {
  source: () => S;
  computation: (
    source: NoInfer<S>,
    previous?: { source: NoInfer<S>; value: NoInfer<D> },
  ) => D;
  equal?: ValueEqualityFn<NoInfer<D>>;
}

export type Signal<T> = () => T;

export interface WritableSignal<T> extends Signal<T> {
  set(value: T): void;
  update(updateFn: (value: T) => T): void;
  asReadonly(): Signal<T>;
}

export type AngularSignal<T> = WritableSignal<T>;

export type EffectCleanupFn = () => void;
export type EffectCleanupRegisterFn = (cleanupFn: EffectCleanupFn) => void;

export interface EffectRef {
  destroy(): void;
}

export interface CreateEffectOptions {
  allowSignalWrites?: boolean;
  manualCleanup?: boolean;
  injector?: Injector;
}

const signals = new WeakSet<Function>();
const writableSignals = new WeakSet<Function>();
const readonlyWrappers = new WeakMap<Function, Signal<any>>();

let disallowWritesDepth = 0;

function withWritesDisallowed<T>(fn: () => T): T {
  disallowWritesDepth++;
  try {
    return fn();
  } finally {
    disallowWritesDepth--;
  }
}

function assertWritesAllowed(): void {
  if (disallowWritesDepth > 0) {
    throw new Error("Cannot write to signals inside a reactive computation");
  }
}

function attachReadonly<T>(target: WritableSignal<T>): () => Signal<T> {
  return () => {
    let ro = readonlyWrappers.get(target);
    if (!ro) {
      ro = (() => target()) as Signal<T>;
      signals.add(ro);
      readonlyWrappers.set(target, ro);
    }
    return ro;
  };
}

export function isSignal(value: unknown): value is Signal<unknown> {
  return typeof value === "function" && signals.has(value);
}

export function isWritableSignal(
  value: unknown,
): value is WritableSignal<unknown> {
  return typeof value === "function" && writableSignals.has(value);
}

export function signal<T>(
  initialValue: T,
  options?: CreateSignalOptions<T>,
): WritableSignal<T> {
  const equal = options?.equal ?? Object.is;
  const [readValue, writeValue] = createDomSignal(initialValue, {
    equals: equal,
  });
  const read = (() => readValue()) as WritableSignal<T>;
  read.set = (value: T) => {
    assertWritesAllowed();
    writeValue(() => value);
  };
  read.update = (updateFn: (value: T) => T) => {
    assertWritesAllowed();
    const current = untrack(readValue);
    const next = untrack(() => updateFn(current));
    writeValue(() => next);
  };
  read.asReadonly = attachReadonly(read);
  signals.add(read);
  writableSignals.add(read);
  return read;
}

export function computed<T>(
  computation: () => T,
  options?: CreateComputedOptions<T>,
): Signal<T> {
  if (typeof computation !== "function") {
    throw new TypeError("computed requires a computation function");
  }
  const equal = options?.equal ?? Object.is;
  let initialized = false;
  let currentBox!: { value: T };
  const memo = msCreateMemo(() => {
    const next = withWritesDisallowed(computation);
    if (!initialized || !equal(currentBox.value, next)) {
      currentBox = { value: next };
      initialized = true;
    }
    return currentBox;
  });
  const read = (() => memo().value) as Signal<T>;
  signals.add(read);
  return read;
}

export function linkedSignal<D>(
  computation: () => D,
  options?: CreateSignalOptions<D>,
): WritableSignal<D>;
export function linkedSignal<S, D>(
  options: LinkedSignalOptions<S, D>,
): WritableSignal<D>;
export function linkedSignal<S, D>(
  computationOrOptions: (() => D) | LinkedSignalOptions<S, D>,
  maybeOptions?: CreateSignalOptions<D>,
): WritableSignal<D> {
  const isShorthand = typeof computationOrOptions === "function";
  if (
    !isShorthand &&
    (typeof computationOrOptions !== "object" ||
      computationOrOptions === null ||
      typeof computationOrOptions.source !== "function" ||
      typeof computationOrOptions.computation !== "function")
  ) {
    throw new TypeError(
      "linkedSignal requires a computation function or { source, computation } options",
    );
  }
  const equal: ValueEqualityFn<D> =
    (isShorthand ? maybeOptions?.equal : computationOrOptions.equal) ??
    Object.is;
  const sourceMemo = isShorthand
    ? msCreateMemo(() => ({
        value: withWritesDisallowed(computationOrOptions) as unknown as S,
      }))
    : (() => {
        const rawSource = msCreateMemo(() =>
          withWritesDisallowed(computationOrOptions.source),
        );
        return msCreateMemo(() => ({ value: rawSource() }));
      })();
  const [overrideVersion, writeOverride] = createDomSignal(0, {
    equals: false,
  });

  let initialized = false;
  let lastSourceBox: { value: S } | undefined;
  let currentSource!: S;
  let currentValue!: D;
  let currentBox!: { value: D };

  const evaluate = (): { value: D } => {
    const nextSourceBox = sourceMemo();
    if (!initialized) {
      const nextSource = nextSourceBox.value;
      const nextValue = isShorthand
        ? (nextSource as unknown as D)
        : withWritesDisallowed(() =>
            untrack(() => computationOrOptions.computation(nextSource)),
          );
      lastSourceBox = nextSourceBox;
      currentSource = nextSource;
      currentValue = nextValue;
      currentBox = { value: nextValue };
      initialized = true;
    } else if (nextSourceBox !== lastSourceBox) {
      const nextSource = nextSourceBox.value;
      const previous = { source: currentSource, value: currentValue };
      const nextValue = isShorthand
        ? (nextSource as unknown as D)
        : withWritesDisallowed(() =>
            untrack(() =>
              computationOrOptions.computation(nextSource, previous),
            ),
          );
      lastSourceBox = nextSourceBox;
      currentSource = nextSource;
      if (!equal(currentValue, nextValue)) {
        currentValue = nextValue;
        currentBox = { value: nextValue };
      }
    }
    return currentBox;
  };

  const memo = msCreateMemo(() => {
    overrideVersion();
    return evaluate();
  });

  const read = (() => memo().value) as WritableSignal<D>;
  read.set = (value: D) => {
    assertWritesAllowed();
    const latestSourceBox = untrack(() => sourceMemo.peek());
    lastSourceBox = latestSourceBox;
    currentSource = latestSourceBox.value;
    if (!initialized || !equal(currentValue, value)) {
      initialized = true;
      currentValue = value;
      currentBox = { value };
      writeOverride((v) => v + 1);
    }
  };
  read.update = (updateFn: (value: D) => D) => {
    assertWritesAllowed();
    const current = untrack(() => evaluate().value);
    const next = untrack(() => updateFn(current));
    const latestSourceBox = untrack(() => sourceMemo.peek());
    lastSourceBox = latestSourceBox;
    currentSource = latestSourceBox.value;
    if (!equal(currentValue, next)) {
      currentValue = next;
      currentBox = { value: next };
      writeOverride((v) => v + 1);
    }
  };
  read.asReadonly = attachReadonly(read);
  signals.add(read);
  writableSignals.add(read);
  return read;
}

export function effect(
  effectFn: (onCleanup: EffectCleanupRegisterFn) => void,
  options?: CreateEffectOptions,
): EffectRef {
  if (typeof effectFn !== "function") {
    throw new TypeError("effect requires a callback function");
  }
  if (isSSRRendering()) {
    return { destroy() {} };
  }
  const outer = getOwner();
  const activeInj = options?.injector ?? currentInjector;
  const injDestroyRef = activeInj?.get(DestroyRef, undefined, {
    optional: true,
  });
  if (
    !options?.manualCleanup &&
    (outer?.disposed || injDestroyRef?.destroyed)
  ) {
    throw new Error("Cannot create an effect inside a disposed native owner");
  }

  let destroyed = false;
  let running = false;
  let dirty = false;
  let currentRunId = 0;
  let stopEffectOwner: (() => void) | undefined;
  let stopRunOwner: (() => void) | undefined;
  let effectOwner = outer;
  const cleanups: EffectCleanupFn[] = [];
  let unsubs: Array<() => void> = [];

  createRoot((dispose) => {
    stopEffectOwner = dispose;
    effectOwner = getOwner();
  });

  const unsubscribeDeps = () => {
    for (const unsub of unsubs.splice(0)) {
      unsub();
    }
  };

  const runCleanup = () => {
    let failed = false;
    let failure: unknown;
    if (stopRunOwner) {
      const stop = stopRunOwner;
      stopRunOwner = undefined;
      try {
        untrack(stop);
      } catch (error) {
        failed = true;
        failure = error;
      }
    }
    for (const fn of cleanups.splice(0)) {
      try {
        untrack(fn);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  };

  const registerCleanup: EffectCleanupRegisterFn = (cleanupFn) => {
    if (typeof cleanupFn !== "function") {
      throw new TypeError("Effect cleanup must be a function");
    }
    if (!destroyed) {
      cleanups.push(cleanupFn);
    }
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    currentRunId++;
    unsubscribeDeps();
    let failed = false;
    let failure: unknown;
    try {
      runCleanup();
    } catch (error) {
      failed = true;
      failure = error;
    }
    if (stopEffectOwner) {
      const stop = stopEffectOwner;
      stopEffectOwner = undefined;
      try {
        untrack(stop);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  };

  const execute = () => {
    if (destroyed) return;
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    try {
      for (let iterations = 1; ; iterations++) {
        if (destroyed) break;
        if (iterations > 1000) {
          throw new Error("Native effect update limit exceeded");
        }
        dirty = false;
        const runId = ++currentRunId;
        unsubscribeDeps();
        runCleanup();
        if (destroyed) break;

        const versions = new Map<Trackable, number>();
        let deps: Trackable[] = [];
        let runFailed = false;
        let runFailure: unknown;

        runWithOwner(effectOwner, () =>
          createRoot((stop) => {
            stopRunOwner = stop;
            deps = collectDeps(
              () => {
                try {
                  const runBody = () => {
                    if (options?.allowSignalWrites === false) {
                      withWritesDisallowed(() => effectFn(registerCleanup));
                    } else {
                      effectFn(registerCleanup);
                    }
                  };
                  if (activeInj) {
                    runInInjectionContext(activeInj, runBody);
                  } else {
                    runBody();
                  }
                } catch (error) {
                  runFailed = true;
                  runFailure = error;
                }
              },
              (dep) => {
                versions.set(dep, dep.version);
              },
            );
          }),
        );

        if (destroyed) {
          unsubscribeDeps();
          runCleanup();
          if (runFailed) throw runFailure;
          break;
        }

        if (runFailed) {
          try {
            runCleanup();
          } catch {
            // Preserve the effect callback error.
          }
          throw runFailure;
        }

        const selfModified = untrack(() =>
          deps.some((dep) => {
            dep.validate?.();
            return dep.version !== versions.get(dep);
          }),
        );
        if (dirty || selfModified) {
          continue;
        }

        for (const dep of deps) {
          unsubs.push(
            dep.subscribe(() => {
              if (destroyed || runId !== currentRunId) return;
              if (running) {
                dirty = true;
                return;
              }
              let changed = false;
              untrack(() => {
                for (const [trackedDep, prevVersion] of versions) {
                  trackedDep.validate?.();
                  if (trackedDep.version !== prevVersion) {
                    changed = true;
                    break;
                  }
                }
              });
              if (changed) {
                execute();
              }
            }),
          );
        }
        break;
      }
    } finally {
      running = false;
    }
  };

  if (!options?.manualCleanup) {
    if (outer) {
      domOnCleanup(destroy);
    }
    if (injDestroyRef) {
      injDestroyRef.onDestroy(destroy);
    }
  }

  execute();

  return { destroy };
}

export function untracked<T>(nonReactiveReadsFn: () => T): T {
  return untrack(nonReactiveReadsFn);
}

export function fromMoonshineSignal<T>(
  msSignal: MsSignal<T>,
): WritableSignal<T> {
  const read = (() => msSignal()) as WritableSignal<T>;
  read.set = (value) => {
    assertWritesAllowed();
    batch(() => {
      msSignal.set(() => value);
    });
  };
  read.update = (fn) => {
    assertWritesAllowed();
    const next = untrack(() => fn(msSignal.peek()));
    batch(() => {
      msSignal.set(() => next);
    });
  };
  read.asReadonly = attachReadonly(read);
  signals.add(read);
  writableSignals.add(read);
  return read;
}

export function createBridgedSignal<T>(
  initial: T,
  options?: CreateSignalOptions<T>,
): WritableSignal<T> {
  if (options?.equal) {
    return signal(initial, options);
  }
  return fromMoonshineSignal(msCreateSignal(initial));
}

const ObservableSymbol: symbol =
  (Symbol as { observable?: symbol }).observable ?? Symbol.for("observable");

export interface Unsubscribable {
  unsubscribe(): void;
}

export type SubscriptionCleanup = (() => void) | Unsubscribable | void;

export interface Observer<T> {
  next?: (value: T) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

export interface Subscribable<T> {
  subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): SubscriptionCleanup;
}

export interface InteropObservable<T> extends Subscribable<T> {
  subscribe(
    observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    error?: (err: unknown) => void,
    complete?: () => void,
  ): Unsubscribable;
}

export interface ToObservableOptions {
  injector?: Injector;
}

export interface ToSignalOptions<T> {
  initialValue?: T;
  requireSync?: boolean;
  manualCleanup?: boolean;
  rejectErrors?: boolean;
  equal?: ValueEqualityFn<T>;
  injector?: Injector;
}

function resolveSubscribable<T>(
  source: Subscribable<T> | InteropObservable<T>,
): Subscribable<T> {
  if (source !== null && typeof source === "object") {
    if (typeof (source as Subscribable<T>).subscribe === "function") {
      return source as Subscribable<T>;
    }
    const record = source as unknown as Record<
      PropertyKey,
      (() => Subscribable<T>) | undefined
    >;
    const symbolFactory = record[ObservableSymbol];
    if (typeof symbolFactory === "function") {
      const target = symbolFactory.call(source);
      if (target && typeof target.subscribe === "function") {
        return target;
      }
    }
    const stringFactory = record["@@observable"];
    if (typeof stringFactory === "function") {
      const target = stringFactory.call(source);
      if (target && typeof target.subscribe === "function") {
        return target;
      }
    }
  }
  throw new TypeError("toSignal requires a Subscribable or Observable source");
}

/**
 * Exposes an Angular `Signal<T>` as an RxJS-compatible `InteropObservable<T>`.
 */
export function toObservable<T>(
  source: Signal<T>,
  options?: ToObservableOptions,
): InteropObservable<T> {
  if (typeof source !== "function") {
    throw new TypeError("toObservable requires a signal function");
  }
  const boundInjector = options?.injector ?? currentInjector;
  const boundDestroyRef = boundInjector?.get(DestroyRef, undefined, {
    optional: true,
  });
  const observable: InteropObservable<T> & Record<PropertyKey, unknown> = {
    subscribe(
      observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
      error?: (err: unknown) => void,
      complete?: () => void,
    ): Unsubscribable {
      const observer: Observer<T> =
        typeof observerOrNext === "function"
          ? { next: observerOrNext, error, complete }
          : {
              next: observerOrNext?.next?.bind(observerOrNext),
              error: (observerOrNext?.error ?? error)?.bind(observerOrNext),
              complete: (observerOrNext?.complete ?? complete)?.bind(
                observerOrNext,
              ),
            };
      if (boundDestroyRef?.destroyed) {
        untrack(() => observer.complete?.());
        return { unsubscribe() {} };
      }
      let closed = false;
      const ref = effect(
        () => {
          if (closed) return;
          let value: T;
          try {
            value = source();
          } catch (err) {
            closed = true;
            untrack(() => observer.error?.(err));
            ref?.destroy();
            return;
          }
          untrack(() => observer.next?.(value));
        },
        { manualCleanup: true, injector: boundInjector },
      );
      if (closed) {
        ref.destroy();
      }
      const offDestroy = boundDestroyRef?.onDestroy(() => {
        if (closed) return;
        closed = true;
        ref.destroy();
        untrack(() => observer.complete?.());
      });
      return {
        unsubscribe() {
          if (closed) return;
          closed = true;
          offDestroy?.();
          ref.destroy();
        },
      };
    },
  };
  observable[ObservableSymbol] = () => observable;
  observable["@@observable"] = () => observable;
  return observable;
}

/**
 * Tracks an Observable or `Subscribable<T>` as a read-only Angular `Signal<T>`.
 */
export function toSignal<T>(
  source: Subscribable<T> | InteropObservable<T>,
  options: ToSignalOptions<T> & { requireSync: true },
): Signal<T>;
export function toSignal<T, U = undefined>(
  source: Subscribable<T> | InteropObservable<T>,
  options: ToSignalOptions<T | U> & { initialValue: U; requireSync?: false },
): Signal<T | U>;
export function toSignal<T>(
  source: Subscribable<T> | InteropObservable<T>,
  options?: ToSignalOptions<T | undefined> & {
    initialValue?: undefined;
    requireSync?: false;
  },
): Signal<T | undefined>;
export function toSignal<T, U = undefined>(
  source: Subscribable<T> | InteropObservable<T>,
  options?: ToSignalOptions<T | U>,
): Signal<T | U | undefined> {
  const subscribable = resolveSubscribable(source);
  const equal = options?.equal ?? Object.is;
  type State =
    | { kind: "value"; value: T | U | undefined }
    | { kind: "error"; error: unknown };

  const [readState, writeState] = createDomSignal<State>(
    { kind: "value", value: options?.initialValue },
    {
      equals: (a, b) =>
        a.kind === "value" &&
        b.kind === "value" &&
        equal(a.value as T | U, b.value as T | U),
    },
  );

  let emittedSync = false;
  const sub = subscribable.subscribe({
    next(value) {
      emittedSync = true;
      writeState(() => ({ kind: "value", value }));
    },
    error(error) {
      if (options?.rejectErrors) {
        throw error;
      }
      emittedSync = true;
      writeState(() => ({ kind: "error", error }));
    },
  });

  const cleanup = () => {
    if (typeof sub === "function") {
      sub();
    } else if (sub && typeof sub.unsubscribe === "function") {
      sub.unsubscribe();
    }
  };

  if (options?.requireSync && !emittedSync) {
    cleanup();
    throw new Error(
      "toSignal() called with requireSync: true, but the observable did not emit synchronously",
    );
  }

  if (!options?.manualCleanup) {
    if (getOwner()) {
      domOnCleanup(cleanup);
    }
    const activeInj = options?.injector ?? currentInjector;
    activeInj
      ?.get(DestroyRef, undefined, { optional: true })
      ?.onDestroy(cleanup);
  }

  const read = (() => {
    const state = readState();
    if (state.kind === "error") {
      throw state.error;
    }
    return state.value;
  }) as Signal<T | U | undefined>;
  signals.add(read);
  return read;
}

export type ResourceStatus =
  "idle" | "error" | "loading" | "reloading" | "resolved" | "local";

export type AngularResourceStatus = ResourceStatus;

export interface ResourceLoaderParams<R> {
  request: Exclude<R, undefined>;
  abortSignal: AbortSignal;
  previous: {
    status: ResourceStatus;
  };
}

export type ResourceLoader<T, R> = (
  params: ResourceLoaderParams<R>,
) => PromiseLike<T>;

export interface ResourceOptions<T, R = unknown> {
  request?: () => R;
  loader: ResourceLoader<T, R>;
  defaultValue?: T;
  equal?: ValueEqualityFn<T>;
  injector?: Injector;
}

export interface Resource<T> {
  readonly value: Signal<T>;
  readonly status: Signal<ResourceStatus>;
  readonly error: Signal<unknown>;
  readonly isLoading: Signal<boolean>;
  hasValue(): this is Resource<Exclude<T, undefined>>;
}

export type AngularResource<T> = Resource<T>;

export interface WritableResource<T> extends Resource<T> {
  set(value: T): void;
  update(updater: (value: T) => T): void;
  asReadonly(): Resource<T>;
  reload(): boolean;
}

export interface ResourceRef<T> extends WritableResource<T> {
  destroy(): void;
}

/**
 * Reactive async resource primitive compatible with Angular 19's `resource()` API.
 */
export function resource<T, R = unknown>(
  options: ResourceOptions<T, R> & { defaultValue: NoInfer<T> },
): ResourceRef<T>;
export function resource<T, R = unknown>(
  options: ResourceOptions<T, R>,
): ResourceRef<T | undefined>;
export function resource<T, R = unknown>(
  options: ResourceOptions<T, R>,
): ResourceRef<T | undefined> {
  if (
    typeof options !== "object" ||
    options === null ||
    typeof options.loader !== "function"
  ) {
    throw new TypeError("resource requires an options object with a loader");
  }

  const defaultValue = options.defaultValue;
  const equal = options.equal ?? Object.is;
  const valueSig = signal<T | undefined>(defaultValue, {
    equal: (a, b) =>
      a === undefined || b === undefined ? Object.is(a, b) : equal(a, b),
  });
  const statusSig = signal<ResourceStatus>("idle");
  const errorSig = signal<unknown>(undefined);
  const isLoadingSig = computed(() => {
    const s = statusSig();
    return s === "loading" || s === "reloading";
  });

  const requestFn: () => R = options.request ?? (() => true as unknown as R);

  let currentAbort: AbortController | undefined;
  let activeLoadId = 0;
  let destroyed = false;

  const abortPending = () => {
    if (currentAbort) {
      const controller = currentAbort;
      currentAbort = undefined;
      controller.abort();
    }
  };

  const startLoad = (
    req: Exclude<R, undefined>,
    nextStatus: "loading" | "reloading",
    previousStatus: ResourceStatus,
  ) => {
    abortPending();
    const loadId = ++activeLoadId;
    const controller = new AbortController();
    currentAbort = controller;

    untrack(() => {
      batch(() => {
        if (nextStatus === "loading") {
          valueSig.set(defaultValue);
        }
        errorSig.set(undefined);
        statusSig.set(nextStatus);
      });
    });

    let promise: PromiseLike<T>;
    try {
      promise = untrack(() =>
        options.loader({
          request: req,
          abortSignal: controller.signal,
          previous: { status: previousStatus },
        }),
      );
    } catch (err) {
      if (!destroyed && loadId === activeLoadId && !controller.signal.aborted) {
        currentAbort = undefined;
        untrack(() => {
          batch(() => {
            valueSig.set(defaultValue);
            errorSig.set(err);
            statusSig.set("error");
          });
        });
      }
      return;
    }

    Promise.resolve(promise).then(
      (resolved) => {
        if (destroyed || loadId !== activeLoadId || controller.signal.aborted) {
          return;
        }
        currentAbort = undefined;
        batch(() => {
          valueSig.set(resolved);
          errorSig.set(undefined);
          statusSig.set("resolved");
        });
      },
      (err) => {
        if (destroyed || loadId !== activeLoadId || controller.signal.aborted) {
          return;
        }
        currentAbort = undefined;
        batch(() => {
          valueSig.set(defaultValue);
          errorSig.set(err);
          statusSig.set("error");
        });
      },
    );
  };

  let lastRequest: R | undefined;
  const watcher = effect(
    () => {
      if (destroyed) return;
      const req = requestFn();
      lastRequest = req;
      const prevStatus = untracked(statusSig);
      if (req === undefined) {
        activeLoadId++;
        abortPending();
        untrack(() => {
          batch(() => {
            valueSig.set(defaultValue);
            errorSig.set(undefined);
            statusSig.set("idle");
          });
        });
        return;
      }
      startLoad(req as Exclude<R, undefined>, "loading", prevStatus);
    },
    { manualCleanup: true },
  );

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    activeLoadId++;
    abortPending();
    watcher.destroy();
  };

  if (getOwner()) {
    domOnCleanup(destroy);
  }
  const activeInj = options.injector ?? currentInjector;
  activeInj?.get(DestroyRef, undefined, { optional: true })?.onDestroy(destroy);

  const hasValueMemo = computed(() => {
    const s = statusSig();
    const v = valueSig();
    if (s === "error") return false;
    if (s === "resolved" || s === "local" || s === "reloading") {
      return v !== undefined;
    }
    return defaultValue !== undefined && v !== undefined;
  });

  const readonlyView: Resource<T | undefined> = {
    value: valueSig.asReadonly(),
    status: statusSig.asReadonly(),
    error: errorSig.asReadonly(),
    isLoading: isLoadingSig,
    hasValue(): this is Resource<Exclude<T | undefined, undefined>> {
      return hasValueMemo();
    },
  };

  const ref: ResourceRef<T | undefined> = {
    value: valueSig,
    status: statusSig.asReadonly(),
    error: errorSig.asReadonly(),
    isLoading: isLoadingSig,
    hasValue(): this is Resource<Exclude<T | undefined, undefined>> {
      return hasValueMemo();
    },
    set(newValue: T | undefined) {
      assertWritesAllowed();
      activeLoadId++;
      abortPending();
      batch(() => {
        valueSig.set(newValue);
        errorSig.set(undefined);
        statusSig.set("local");
      });
    },
    update(updater: (value: T | undefined) => T | undefined) {
      assertWritesAllowed();
      const current = untracked(valueSig);
      const next = untracked(() => updater(current));
      ref.set(next);
    },
    asReadonly() {
      return readonlyView;
    },
    reload(): boolean {
      if (destroyed) return false;
      const currentStatus = untracked(statusSig);
      if (
        currentStatus === "idle" ||
        currentStatus === "loading" ||
        currentStatus === "reloading"
      ) {
        return false;
      }
      const req = lastRequest ?? untracked(requestFn);
      if (req === undefined) {
        return false;
      }
      const nextStatus =
        currentStatus === "resolved" || currentStatus === "local"
          ? "reloading"
          : "loading";
      startLoad(req as Exclude<R, undefined>, nextStatus, currentStatus);
      return true;
    },
    destroy,
  };

  return ref;
}

export interface OutputOptions {
  alias?: string;
}

export interface OutputRefSubscription {
  unsubscribe(): void;
}

export interface OutputRef<T> {
  subscribe(callback: (value: T) => void): OutputRefSubscription;
}

export class OutputEmitterRef<T = void> implements OutputRef<T> {
  readonly #listeners = new Set<(value: T) => void>();
  #destroyed = false;

  constructor() {
    if (getOwner()) {
      domOnCleanup(() => {
        this.destroy();
      });
    }
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  subscribe(callback: (value: T) => void): OutputRefSubscription {
    if (this.#destroyed) {
      throw new Error(
        "Unexpected subscription to destroyed OutputRef. The owning directive/component is destroyed.",
      );
    }
    this.#listeners.add(callback);
    const unsubscribe = () => {
      this.#listeners.delete(callback);
    };
    if (getOwner()) {
      domOnCleanup(unsubscribe);
    }
    return { unsubscribe };
  }

  emit(value: T): void {
    if (this.#destroyed) {
      throw new Error(
        "Unexpected emit for destroyed OutputRef. The owning directive/component is destroyed.",
      );
    }
    for (const listener of Array.from(this.#listeners)) {
      untracked(() => listener(value));
    }
  }

  destroy(): void {
    this.#destroyed = true;
    this.#listeners.clear();
  }
}

export function output<T = void>(_opts?: OutputOptions): OutputEmitterRef<T> {
  return new OutputEmitterRef<T>();
}

export function outputFromObservable<T>(
  observable: Subscribable<T>,
  _opts?: OutputOptions,
): OutputRef<T> {
  const owner = getOwner();
  let destroyed = false;
  if (owner) {
    domOnCleanup(() => {
      destroyed = true;
    });
  }
  return {
    subscribe(callback: (value: T) => void): OutputRefSubscription {
      if (destroyed) {
        throw new Error(
          "Unexpected subscription to destroyed OutputRef. The owning directive/component is destroyed.",
        );
      }
      const sub = observable.subscribe({
        next: (value: T) => {
          if (!destroyed) {
            untracked(() => callback(value));
          }
        },
      });
      const unsubscribe = () => {
        if (typeof sub === "function") {
          sub();
        } else if (sub && typeof sub.unsubscribe === "function") {
          sub.unsubscribe();
        }
      };
      if (getOwner()) {
        domOnCleanup(unsubscribe);
      } else if (owner && !owner.disposed) {
        runWithOwner(owner, () => domOnCleanup(unsubscribe));
      }
      return { unsubscribe };
    },
  };
}

export function outputToObservable<T>(ref: OutputRef<T>): InteropObservable<T> {
  const obs: InteropObservable<T> & Record<PropertyKey, unknown> = {
    subscribe(
      observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
    ): Unsubscribable {
      const nextFn =
        typeof observerOrNext === "function"
          ? observerOrNext
          : observerOrNext?.next
            ? (v: T) => observerOrNext.next!(v)
            : undefined;
      if (!nextFn) {
        return { unsubscribe() {} };
      }
      return ref.subscribe(nextFn);
    },
  };
  obs[ObservableSymbol] = () => obs;
  obs["@@observable"] = () => obs;
  return obs;
}

export interface InputOptionsWithoutTransform<T> {
  alias?: string;
  readonly __brand?: T;
}

export interface InputOptionsWithTransform<T, TransformT> {
  alias?: string;
  transform: (v: TransformT) => T;
}

export type InputOptions<T, TransformT> =
  InputOptionsWithoutTransform<T> | InputOptionsWithTransform<T, TransformT>;

declare const inputWriteBrand: unique symbol;

export interface InputSignalWithTransform<ReadT, WriteT> extends Signal<ReadT> {
  readonly [inputWriteBrand]?: WriteT;
}

export type InputSignal<T> = InputSignalWithTransform<T, T>;

type InputController = {
  applyValue: (rawValue: any) => void;
  alias?: string;
};

const inputControllers = new WeakMap<Function, InputController>();

function createInputSignalInternal<ReadT, WriteT>(
  initialValue: ReadT | undefined,
  required: boolean,
  options?: InputOptions<ReadT, WriteT>,
): InputSignalWithTransform<ReadT, WriteT> {
  let initialized = !required;
  const transform =
    options && "transform" in options && typeof options.transform === "function"
      ? options.transform
      : undefined;
  const backing = signal<ReadT>(initialValue as ReadT);

  const read = (() => {
    if (!initialized) {
      throw new Error(
        `Input${options?.alias ? ` "${options.alias}"` : ""} is required, but no value is available yet.`,
      );
    }
    return backing();
  }) as InputSignalWithTransform<ReadT, WriteT>;

  signals.add(read);
  inputControllers.set(read, {
    alias: options?.alias,
    applyValue(rawValue: WriteT) {
      const next = transform
        ? transform(rawValue)
        : (rawValue as unknown as ReadT);
      initialized = true;
      backing.set(next);
    },
  });
  return read;
}

export interface InputFunction {
  <T>(): InputSignal<T | undefined>;
  <T>(initialValue: T, opts?: InputOptionsWithoutTransform<T>): InputSignal<T>;
  <T, TransformT>(
    initialValue: T,
    opts: InputOptionsWithTransform<T, TransformT>,
  ): InputSignalWithTransform<T, TransformT>;
  required: {
    <T>(opts?: InputOptionsWithoutTransform<T>): InputSignal<T>;
    <T, TransformT>(
      opts: InputOptionsWithTransform<T, TransformT>,
    ): InputSignalWithTransform<T, TransformT>;
  };
}

export const input: InputFunction = Object.assign(
  function inputImpl<T, TransformT = T>(
    initialValue?: T,
    opts?: InputOptions<T, TransformT>,
  ): InputSignalWithTransform<T, TransformT> {
    return createInputSignalInternal<T, TransformT>(initialValue, false, opts);
  },
  {
    required<T, TransformT = T>(
      opts?: InputOptions<T, TransformT>,
    ): InputSignalWithTransform<T, TransformT> {
      return createInputSignalInternal<T, TransformT>(undefined, true, opts);
    },
  },
) as InputFunction;

export function applyInputValue<ReadT, WriteT>(
  target: InputSignalWithTransform<ReadT, WriteT> | ModelSignal<ReadT>,
  value: WriteT,
): void {
  const ctrl = inputControllers.get(target);
  if (!ctrl) {
    throw new TypeError("Target is not an Angular input() or model() signal");
  }
  ctrl.applyValue(value);
}

export interface ModelOptions {
  alias?: string;
}

export interface ModelSignal<T> extends WritableSignal<T>, OutputRef<T> {}

function createModelSignalInternal<T>(
  initialValue: T | undefined,
  required: boolean,
  options?: ModelOptions,
): ModelSignal<T> {
  let initialized = !required;
  const backing = signal<T>(initialValue as T);
  const emitter = new OutputEmitterRef<T>();

  const read = (() => {
    if (!initialized) {
      throw new Error(
        `Model${options?.alias ? ` "${options.alias}"` : ""} is required, but no value is available yet.`,
      );
    }
    return backing();
  }) as ModelSignal<T>;

  read.set = (value: T) => {
    assertWritesAllowed();
    initialized = true;
    backing.set(value);
    emitter.emit(value);
  };

  read.update = (updateFn: (value: T) => T) => {
    assertWritesAllowed();
    if (!initialized) {
      throw new Error(
        `Model${options?.alias ? ` "${options.alias}"` : ""} is required, but no value is available yet.`,
      );
    }
    const current = untracked(backing);
    const next = untracked(() => updateFn(current));
    read.set(next);
  };

  read.asReadonly = attachReadonly(read);
  read.subscribe = (callback: (value: T) => void) =>
    emitter.subscribe(callback);

  signals.add(read);
  writableSignals.add(read);
  inputControllers.set(read, {
    alias: options?.alias,
    applyValue(rawValue: T) {
      initialized = true;
      backing.set(rawValue);
    },
  });

  return read;
}

export interface ModelFunction {
  <T>(): ModelSignal<T | undefined>;
  <T>(initialValue: T, opts?: ModelOptions): ModelSignal<T>;
  required: <T>(opts?: ModelOptions) => ModelSignal<T>;
}

export const model: ModelFunction = Object.assign(
  function modelImpl<T>(initialValue?: T, opts?: ModelOptions): ModelSignal<T> {
    return createModelSignalInternal<T>(initialValue, false, opts);
  },
  {
    required<T>(opts?: ModelOptions): ModelSignal<T> {
      return createModelSignalInternal<T>(undefined, true, opts);
    },
  },
) as ModelFunction;

export abstract class DestroyRef {
  abstract onDestroy(callback: () => void): () => void;
  abstract readonly destroyed: boolean;
  abstract destroy(): void;
}

class NativeDestroyRef extends DestroyRef {
  #isDestroyed = false;
  readonly #callbacks = new Set<() => void>();

  constructor(bindToOwner = true) {
    super();
    if (bindToOwner && getOwner()) {
      domOnCleanup(() => {
        this.destroy();
      });
    }
  }

  override get destroyed(): boolean {
    return this.#isDestroyed;
  }

  override onDestroy(callback: () => void): () => void {
    if (this.#isDestroyed) {
      callback();
      return () => {};
    }
    this.#callbacks.add(callback);
    return () => {
      this.#callbacks.delete(callback);
    };
  }

  override destroy(): void {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    const toRun = Array.from(this.#callbacks);
    this.#callbacks.clear();
    for (const cb of toRun) {
      cb();
    }
  }
}

const ownerDestroyRefs = new WeakMap<object, DestroyRef>();

export function createDestroyRef(): DestroyRef {
  return new NativeDestroyRef(true);
}

export function injectDestroyRef(): DestroyRef {
  if (currentInjector) {
    const fromInj = currentInjector.get(DestroyRef, undefined, {
      optional: true,
    });
    if (fromInj) {
      return fromInj;
    }
  }
  const owner = getOwner();
  if (!owner) {
    throw new Error(
      "injectDestroyRef() must be called within an active reactive owner or injection context",
    );
  }
  let ref = ownerDestroyRefs.get(owner);
  if (!ref) {
    ref = createDestroyRef();
    ownerDestroyRefs.set(owner, ref);
  }
  return ref;
}

export function takeUntilDestroyed<T>(
  destroyRef?: DestroyRef,
): (source: Subscribable<T>) => InteropObservable<T> {
  const resolvedDestroyRef = destroyRef ?? injectDestroyRef();
  return (source: Subscribable<T>): InteropObservable<T> => {
    const obs: InteropObservable<T> & Record<PropertyKey, unknown> = {
      subscribe(
        observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
      ): Unsubscribable {
        if (resolvedDestroyRef.destroyed) {
          if (
            typeof observerOrNext === "object" &&
            observerOrNext !== null &&
            typeof observerOrNext.complete === "function"
          ) {
            observerOrNext.complete();
          }
          return { unsubscribe() {} };
        }
        let active = true;
        const observer: Partial<Observer<T>> =
          typeof observerOrNext === "function"
            ? {
                next: (v: T) => {
                  if (active) observerOrNext(v);
                },
              }
            : {
                next: (v: T) => {
                  if (active) observerOrNext?.next?.(v);
                },
                error: (e: unknown) => {
                  if (active) observerOrNext?.error?.(e);
                },
                complete: () => {
                  if (active) observerOrNext?.complete?.();
                },
              };
        const sub = source.subscribe(observer);
        const cleanupSub = () => {
          if (!active) return;
          active = false;
          if (typeof sub === "function") {
            sub();
          } else if (sub && typeof sub.unsubscribe === "function") {
            sub.unsubscribe();
          }
        };
        const offDestroy = resolvedDestroyRef.onDestroy(() => {
          if (active) {
            observer.complete?.();
            cleanupSub();
          }
        });
        return {
          unsubscribe() {
            offDestroy();
            cleanupSub();
          },
        };
      },
    };
    obs[ObservableSymbol] = () => obs;
    obs["@@observable"] = () => obs;
    return obs;
  };
}

export interface AfterRenderRef {
  destroy(): void;
}

export interface AfterRenderOptions {
  injector?: Injector;
}

export interface AfterRenderPhases<E = unknown, W = unknown, M = unknown> {
  earlyRead?: () => E;
  write?: (...args: [E] extends [never] ? [] : [E]) => W;
  mixedReadWrite?: (...args: [W] extends [never] ? [] : [W]) => M;
  read?: (...args: [M] extends [never] ? [] : [M]) => void;
}

export type AfterRenderSpec<E = any, W = any, M = any> =
  (() => void) | AfterRenderPhases<E, W, M>;

function executeRenderSpec(spec: AfterRenderSpec, injector?: Injector): void {
  const runPhase = <R>(fn: () => R): R =>
    injector
      ? runInInjectionContext(injector, () => untracked(fn))
      : untracked(fn);
  if (typeof spec === "function") {
    runPhase(spec);
    return;
  }
  let lastResult: any;
  if (spec.earlyRead) {
    lastResult = runPhase(() => spec.earlyRead!());
  }
  if (spec.write) {
    lastResult = runPhase(() => spec.write!(lastResult));
  }
  if (spec.mixedReadWrite) {
    lastResult = runPhase(() => spec.mixedReadWrite!(lastResult));
  }
  if (spec.read) {
    runPhase(() => spec.read!(lastResult));
  }
}

export function afterNextRender(
  spec: AfterRenderSpec,
  options?: AfterRenderOptions,
): AfterRenderRef {
  if (isSSRRendering()) {
    return { destroy() {} };
  }
  const activeInj = options?.injector ?? currentInjector;
  let cancelled = false;
  const destroy = () => {
    cancelled = true;
  };
  if (getOwner()) {
    domOnCleanup(destroy);
  }
  activeInj?.get(DestroyRef, undefined, { optional: true })?.onDestroy(destroy);
  queueMicrotask(() => {
    if (!cancelled) {
      cancelled = true;
      executeRenderSpec(spec, activeInj);
    }
  });
  return { destroy };
}

export function afterRender(
  spec: AfterRenderSpec,
  options?: AfterRenderOptions,
): AfterRenderRef {
  if (isSSRRendering()) {
    return { destroy() {} };
  }
  const activeInj = options?.injector ?? currentInjector;
  let cancelled = false;
  const destroy = () => {
    cancelled = true;
  };
  if (getOwner()) {
    domOnCleanup(destroy);
  }
  activeInj?.get(DestroyRef, undefined, { optional: true })?.onDestroy(destroy);
  queueMicrotask(() => {
    if (!cancelled) {
      executeRenderSpec(spec, activeInj);
    }
  });
  return { destroy };
}

export interface Type<T> extends Function {
  new (...args: any[]): T;
}

export interface AbstractType<T> extends Function {
  prototype: T;
}

export interface InjectionTokenOptions<T> {
  providedIn?: "root" | "platform" | "any" | null;
  factory?: () => T;
}

export class InjectionToken<T> {
  readonly _desc: string;
  readonly ɵprov?: {
    token: InjectionToken<T>;
    providedIn: "root" | "platform" | "any" | null;
    factory: () => T;
  };

  constructor(desc: string, options?: InjectionTokenOptions<T>) {
    this._desc = desc;
    if (options?.factory) {
      this.ɵprov = {
        token: this,
        providedIn:
          options.providedIn === undefined ? "root" : options.providedIn,
        factory: options.factory,
      };
    }
  }

  toString(): string {
    return `InjectionToken ${this._desc}`;
  }
}

export class HostAttributeToken {
  readonly attributeName: string;

  constructor(attributeName: string) {
    this.attributeName = attributeName;
  }

  toString(): string {
    return `HostAttributeToken ${this.attributeName}`;
  }
}

export type ProviderToken<T> = Type<T> | AbstractType<T> | InjectionToken<T>;

export interface InjectOptions {
  optional?: boolean;
  skipSelf?: boolean;
  self?: boolean;
  host?: boolean;
}

export interface ValueProvider<T = any> {
  provide: ProviderToken<T> | HostAttributeToken | string;
  useValue: T;
  multi?: boolean;
}

export interface FactoryProvider<T = any> {
  provide: ProviderToken<T> | HostAttributeToken | string;
  useFactory: (...deps: any[]) => T;
  deps?: any[];
  multi?: boolean;
}

export interface ExistingProvider<T = any> {
  provide: ProviderToken<T> | HostAttributeToken | string;
  useExisting: ProviderToken<T> | HostAttributeToken | string;
  multi?: boolean;
}

export interface ClassProvider<T = any> {
  provide: ProviderToken<T> | HostAttributeToken | string;
  useClass: Type<T>;
  deps?: any[];
  multi?: boolean;
}

export interface ConstructorProvider<T = any> {
  provide: Type<T>;
  deps?: any[];
  multi?: boolean;
}

export type StaticProvider =
  | ValueProvider
  | FactoryProvider
  | ExistingProvider
  | ClassProvider
  | ConstructorProvider
  | StaticProvider[];

export interface EnvironmentProviders {
  readonly ɵbrand: "EnvironmentProviders";
  readonly providers: (Provider | EnvironmentProviders)[];
}

export type Provider =
  | Type<any>
  | ValueProvider
  | FactoryProvider
  | ExistingProvider
  | ClassProvider
  | ConstructorProvider
  | EnvironmentProviders
  | Provider[];

export function makeEnvironmentProviders(
  providers: (Provider | EnvironmentProviders)[],
): EnvironmentProviders {
  return {
    ɵbrand: "EnvironmentProviders",
    providers,
  };
}

export const ENVIRONMENT_INITIALIZER = new InjectionToken<
  readonly (() => void)[]
>("ENVIRONMENT_INITIALIZER");

export function provideEnvironmentInitializer(
  initializerFn: () => void,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      useValue: initializerFn,
      multi: true,
    },
  ]);
}

function formatTokenName(token: unknown): string {
  if (token instanceof InjectionToken || token instanceof HostAttributeToken) {
    return token.toString();
  }
  if (typeof token === "function") {
    return token.name || "AnonymousType";
  }
  return String(token);
}

const THROW_IF_NOT_FOUND_SYMBOL = Symbol("Injector.THROW_IF_NOT_FOUND");
const UNINITIALIZED_RECORD = Symbol("Injector.UNINITIALIZED");

export abstract class Injector {
  static readonly THROW_IF_NOT_FOUND: symbol = THROW_IF_NOT_FOUND_SYMBOL;
  static NULL: Injector;

  static create(
    options:
      | {
          providers: (Provider | EnvironmentProviders)[];
          parent?: Injector;
          name?: string;
        }
      | (Provider | EnvironmentProviders)[],
    parent?: Injector,
  ): EnvironmentInjector {
    if (Array.isArray(options)) {
      return createEnvironmentInjector(options, parent);
    }
    return createEnvironmentInjector(
      options.providers,
      options.parent ?? parent,
      options.name,
    );
  }

  abstract get<T>(
    token: ProviderToken<T> | HostAttributeToken | string,
    notFoundValue?: T,
    options?: InjectOptions,
  ): T;
}

class NullInjector extends Injector {
  override get<T>(
    token: ProviderToken<T> | HostAttributeToken | string,
    notFoundValue: unknown = THROW_IF_NOT_FOUND_SYMBOL,
    options?: InjectOptions,
  ): T {
    if (notFoundValue === THROW_IF_NOT_FOUND_SYMBOL) {
      if (options?.optional) {
        return null as unknown as T;
      }
      throw new Error(
        `NG0201: No provider for ${formatTokenName(token)} found!`,
      );
    }
    return notFoundValue as T;
  }
}

Injector.NULL = new NullInjector();

export abstract class EnvironmentInjector extends Injector {
  abstract runInContext<ReturnT>(fn: () => ReturnT): ReturnT;
  abstract destroy(): void;
  abstract readonly destroyed: boolean;
}

type ProviderRecord = {
  multi: boolean;
  factory: () => any;
  factories?: Array<() => any>;
  value: any;
};

type InjectableDef<T = any> = {
  providedIn?: "root" | "platform" | "any" | null;
  factory: () => T;
};

function getInjectableDef<T>(token: unknown): InjectableDef<T> | undefined {
  if (
    (typeof token === "object" || typeof token === "function") &&
    token !== null &&
    "ɵprov" in token
  ) {
    const prov = (token as { ɵprov?: InjectableDef<T> }).ɵprov;
    if (prov && typeof prov.factory === "function") {
      return prov;
    }
  }
  return undefined;
}

class NativeEnvironmentInjector extends EnvironmentInjector {
  readonly #records = new Map<unknown, ProviderRecord>();
  readonly #hostAttrs = new Map<string, string>();
  readonly #instantiating = new Set<unknown>();
  readonly #parent: Injector;
  readonly #isRoot: boolean;
  readonly #destroyRef: NativeDestroyRef;
  readonly debugName?: string;

  constructor(
    providers: (Provider | EnvironmentProviders)[],
    parent?: Injector,
    debugName?: string,
    isRoot = false,
  ) {
    super();
    this.#parent = parent ?? Injector.NULL;
    this.#isRoot = isRoot || !(parent instanceof NativeEnvironmentInjector);
    this.debugName = debugName;
    this.#destroyRef = new NativeDestroyRef(true);

    this.#records.set(Injector, {
      multi: false,
      factory: () => this,
      value: this,
    });
    this.#records.set(EnvironmentInjector, {
      multi: false,
      factory: () => this,
      value: this,
    });
    this.#records.set(DestroyRef, {
      multi: false,
      factory: () => this.#destroyRef,
      value: this.#destroyRef,
    });

    this.#registerProviders(providers);
  }

  override get destroyed(): boolean {
    return this.#destroyRef.destroyed;
  }

  override runInContext<ReturnT>(fn: () => ReturnT): ReturnT {
    if (this.#destroyRef.destroyed) {
      throw new Error("NG0205: Injector has already been destroyed.");
    }
    return runInInjectionContext(this, fn);
  }

  override destroy(): void {
    this.#destroyRef.destroy();
  }

  #resolveDeps(deps?: any[]): any[] {
    if (!deps || deps.length === 0) return [];
    return deps.map((depEntry) => {
      if (Array.isArray(depEntry)) {
        let opts: InjectOptions = {};
        let token: any;
        for (const item of depEntry) {
          if (
            item &&
            typeof item === "object" &&
            !(item instanceof InjectionToken) &&
            !(item instanceof HostAttributeToken)
          ) {
            opts = { ...opts, ...item };
          } else {
            token = item;
          }
        }
        return this.get(token, undefined, opts);
      }
      return this.get(depEntry);
    });
  }

  #createProviderFactory(
    provider: Exclude<Provider, Provider[] | EnvironmentProviders>,
  ): () => any {
    if (typeof provider === "function") {
      return () =>
        runInInjectionContext(this, () => new (provider as Type<any>)());
    }
    if ("useValue" in provider) {
      return () => provider.useValue;
    }
    if ("useFactory" in provider) {
      return () =>
        runInInjectionContext(this, () => {
          const resolved = this.#resolveDeps(provider.deps);
          return provider.useFactory(...resolved);
        });
    }
    if ("useExisting" in provider) {
      return () => this.get(provider.useExisting);
    }
    if ("useClass" in provider) {
      return () =>
        runInInjectionContext(this, () => {
          const resolved = this.#resolveDeps(provider.deps);
          return new provider.useClass(...resolved);
        });
    }
    return () =>
      runInInjectionContext(this, () => {
        const resolved = this.#resolveDeps(provider.deps);
        return new provider.provide(...resolved);
      });
  }

  #registerProviders(providers: (Provider | EnvironmentProviders)[]): void {
    for (const entry of providers) {
      if (!entry) continue;
      if (Array.isArray(entry)) {
        this.#registerProviders(entry);
        continue;
      }
      if (typeof entry === "object" && "ɵbrand" in entry) {
        this.#registerProviders(entry.providers);
        continue;
      }
      const token = typeof entry === "function" ? entry : entry.provide;
      const isMulti = typeof entry === "object" && Boolean(entry.multi);
      const factory = this.#createProviderFactory(entry);

      if (
        token instanceof HostAttributeToken &&
        typeof entry === "object" &&
        "useValue" in entry
      ) {
        this.#hostAttrs.set(token.attributeName, String(entry.useValue));
      }

      if (isMulti) {
        let existing = this.#records.get(token);
        if (!existing || !existing.multi) {
          existing = {
            multi: true,
            factory: () => existing!.factories!.map((f) => f()),
            factories: [],
            value: UNINITIALIZED_RECORD,
          };
          this.#records.set(token, existing);
        }
        existing.factories!.push(factory);
      } else {
        this.#records.set(token, {
          multi: false,
          factory,
          value: UNINITIALIZED_RECORD,
        });
      }
    }
  }

  #resolveRecord<T>(token: unknown, record: ProviderRecord): T {
    if (record.value !== UNINITIALIZED_RECORD) {
      return record.value as T;
    }
    if (this.#instantiating.has(token)) {
      throw new Error(
        `NG0200: Circular dependency in DI detected for ${formatTokenName(token)}.`,
      );
    }
    this.#instantiating.add(token);
    try {
      const value = record.factory();
      record.value = value;
      return value as T;
    } finally {
      this.#instantiating.delete(token);
    }
  }

  override get<T>(
    token: ProviderToken<T> | HostAttributeToken | string,
    notFoundValue: unknown = THROW_IF_NOT_FOUND_SYMBOL,
    options?: InjectOptions,
  ): T {
    if (options?.skipSelf) {
      if (options.self) {
        return Injector.NULL.get(token, notFoundValue as T, options);
      }
      const nextOpts: InjectOptions = { ...options, skipSelf: false };
      return this.#parent.get(token, notFoundValue as T, nextOpts);
    }

    if (
      token instanceof HostAttributeToken &&
      this.#hostAttrs.has(token.attributeName)
    ) {
      return this.#hostAttrs.get(token.attributeName) as unknown as T;
    }

    const record = this.#records.get(token);
    if (record) {
      return this.#resolveRecord<T>(token, record);
    }

    const def = getInjectableDef<T>(token);
    if (def && !options?.self) {
      if (
        def.providedIn === "any" ||
        (this.#isRoot &&
          (def.providedIn === "root" || def.providedIn === "platform"))
      ) {
        const autoRecord: ProviderRecord = {
          multi: false,
          factory: () => runInInjectionContext(this, def.factory),
          value: UNINITIALIZED_RECORD,
        };
        this.#records.set(token, autoRecord);
        return this.#resolveRecord<T>(token, autoRecord);
      }
    }

    if (options?.self) {
      return Injector.NULL.get(token, notFoundValue as T, options);
    }

    return this.#parent.get(token, notFoundValue as T, options);
  }
}

let currentInjector: Injector | undefined;
let defaultRootInjector: NativeEnvironmentInjector | undefined;
const ownerInjectors = new WeakMap<object, NativeEnvironmentInjector>();

function getDefaultRootInjector(): NativeEnvironmentInjector {
  if (!defaultRootInjector || defaultRootInjector.destroyed) {
    defaultRootInjector = new NativeEnvironmentInjector(
      [],
      Injector.NULL,
      "RootEnvironmentInjector",
      true,
    );
  }
  return defaultRootInjector;
}

export function getCurrentInjector(): Injector | undefined {
  return currentInjector;
}

export function setCurrentInjector(
  injector: Injector | undefined,
): Injector | undefined {
  const prev = currentInjector;
  currentInjector = injector;
  return prev;
}

export function runInInjectionContext<ReturnT>(
  injector: Injector,
  fn: () => ReturnT,
): ReturnT {
  if (injector instanceof EnvironmentInjector && injector.destroyed) {
    throw new Error("NG0205: Injector has already been destroyed.");
  }
  const prev = setCurrentInjector(injector);
  try {
    return fn();
  } finally {
    setCurrentInjector(prev);
  }
}

export function assertInInjectionContext(debugFn: Function): void {
  if (!currentInjector && !getOwner()) {
    const name = debugFn?.name || "Function";
    throw new Error(
      `NG0203: ${name}() must be called from an injection context such as a constructor, a factory function, a field initializer, or a function used with \`runInInjectionContext\`.`,
    );
  }
}

export function createEnvironmentInjector(
  providers: (Provider | EnvironmentProviders)[],
  parent?: EnvironmentInjector | Injector,
  debugName?: string,
): EnvironmentInjector {
  const resolvedParent = parent ?? getDefaultRootInjector();
  const injector = new NativeEnvironmentInjector(
    providers,
    resolvedParent,
    debugName,
    !parent,
  );
  const initializers = injector.get(ENVIRONMENT_INITIALIZER, null, {
    optional: true,
    self: true,
  });
  if (Array.isArray(initializers)) {
    for (const init of initializers) {
      if (typeof init === "function") {
        runInInjectionContext(injector, init);
      }
    }
  }
  return injector;
}

function resolveActiveInjectorForInject(): Injector {
  if (currentInjector) {
    return currentInjector;
  }
  const owner = getOwner();
  if (!owner) {
    throw new Error(
      "NG0203: inject() must be called from an injection context such as a constructor, a factory function, a field initializer, or a function used with `runInInjectionContext`.",
    );
  }
  let inj = ownerInjectors.get(owner);
  if (!inj) {
    const destroyRef = injectDestroyRef();
    inj = new NativeEnvironmentInjector(
      [{ provide: DestroyRef, useValue: destroyRef }],
      getDefaultRootInjector(),
      "OwnerEnvironmentInjector",
      false,
    );
    ownerInjectors.set(owner, inj);
  }
  return inj;
}

export function inject<T>(token: ProviderToken<T>): T;
export function inject<T>(
  token: ProviderToken<T>,
  options: InjectOptions & { optional?: false },
): T;
export function inject<T>(
  token: ProviderToken<T>,
  options: InjectOptions,
): T | null;
export function inject(
  token: HostAttributeToken,
  options?: InjectOptions & { optional?: false },
): string;
export function inject(
  token: HostAttributeToken,
  options: InjectOptions,
): string | null;
export function inject<T>(
  token: ProviderToken<T> | HostAttributeToken,
  options?: InjectOptions,
): T | string | null {
  const injector = resolveActiveInjectorForInject();
  return injector.get(
    token as ProviderToken<T>,
    THROW_IF_NOT_FOUND_SYMBOL as unknown as T,
    options,
  );
}

export interface QueryOptions<ReadT = unknown> {
  read?: ProviderToken<ReadT> | string;
}

export interface ContentChildOptions<
  ReadT = unknown,
> extends QueryOptions<ReadT> {
  descendants?: boolean;
}

export type QueryKind =
  "viewChild" | "viewChildren" | "contentChild" | "contentChildren";

export interface QueryMetadata<LocatorT = unknown, ReadT = unknown> {
  readonly kind: QueryKind;
  readonly locator: ProviderToken<LocatorT> | string;
  readonly read?: ProviderToken<ReadT> | string;
  readonly descendants: boolean;
  readonly required: boolean;
}

type QueryController = {
  applyValue: (value: any) => void;
  metadata: QueryMetadata<any, any>;
};

const queryControllers = new WeakMap<Function, QueryController>();

function createSingleQuerySignal<LocatorT, ReadT>(
  kind: "viewChild" | "contentChild",
  locator: ProviderToken<LocatorT> | string,
  required: boolean,
  descendants: boolean,
  options?: QueryOptions<ReadT>,
): Signal<ReadT> {
  let initialized = !required;
  const backing = signal<ReadT | undefined>(undefined);
  const metadata: QueryMetadata<LocatorT, ReadT> = Object.freeze({
    kind,
    locator,
    read: options?.read,
    descendants,
    required,
  });

  const read = (() => {
    const current = backing();
    if (required && (!initialized || current === undefined)) {
      throw new Error(
        `NG0951: Child query result is required, but no value is available (${formatTokenName(locator)}).`,
      );
    }
    return current as ReadT;
  }) as Signal<ReadT>;

  signals.add(read);
  queryControllers.set(read, {
    metadata,
    applyValue(nextValue: ReadT | undefined) {
      initialized = true;
      backing.set(nextValue);
    },
  });
  return read;
}

function createMultiQuerySignal<LocatorT, ReadT>(
  kind: "viewChildren" | "contentChildren",
  locator: ProviderToken<LocatorT> | string,
  descendants: boolean,
  options?: QueryOptions<ReadT>,
): Signal<readonly ReadT[]> {
  const emptyList: readonly ReadT[] = Object.freeze([]);
  const backing = signal<readonly ReadT[]>(emptyList);
  const metadata: QueryMetadata<LocatorT, ReadT> = Object.freeze({
    kind,
    locator,
    read: options?.read,
    descendants,
    required: false,
  });

  const read = (() => backing()) as Signal<readonly ReadT[]>;
  signals.add(read);
  queryControllers.set(read, {
    metadata,
    applyValue(nextValues: readonly ReadT[]) {
      const normalized = Array.isArray(nextValues)
        ? Object.freeze(Array.from(nextValues))
        : emptyList;
      backing.set(normalized);
    },
  });
  return read;
}

export interface ViewChildFunction {
  <LocatorT>(
    locator: ProviderToken<LocatorT> | string,
  ): Signal<LocatorT | undefined>;
  <LocatorT, ReadT>(
    locator: ProviderToken<LocatorT> | string,
    opts: QueryOptions<ReadT> & { read: ProviderToken<ReadT> | string },
  ): Signal<ReadT | undefined>;
  <LocatorT>(
    locator: ProviderToken<LocatorT> | string,
    opts?: QueryOptions<LocatorT>,
  ): Signal<LocatorT | undefined>;
  required: {
    <LocatorT>(locator: ProviderToken<LocatorT> | string): Signal<LocatorT>;
    <LocatorT, ReadT>(
      locator: ProviderToken<LocatorT> | string,
      opts: QueryOptions<ReadT> & { read: ProviderToken<ReadT> | string },
    ): Signal<ReadT>;
    <LocatorT>(
      locator: ProviderToken<LocatorT> | string,
      opts?: QueryOptions<LocatorT>,
    ): Signal<LocatorT>;
  };
}

export const viewChild: ViewChildFunction = Object.assign(
  function viewChildImpl<LocatorT, ReadT = LocatorT>(
    locator: ProviderToken<LocatorT> | string,
    opts?: QueryOptions<ReadT>,
  ): Signal<ReadT | undefined> {
    return createSingleQuerySignal<LocatorT, ReadT | undefined>(
      "viewChild",
      locator,
      false,
      true,
      opts as QueryOptions<ReadT | undefined>,
    );
  },
  {
    required<LocatorT, ReadT = LocatorT>(
      locator: ProviderToken<LocatorT> | string,
      opts?: QueryOptions<ReadT>,
    ): Signal<ReadT> {
      return createSingleQuerySignal<LocatorT, ReadT>(
        "viewChild",
        locator,
        true,
        true,
        opts,
      );
    },
  },
) as ViewChildFunction;

export function viewChildren<LocatorT>(
  locator: ProviderToken<LocatorT> | string,
): Signal<readonly LocatorT[]>;
export function viewChildren<LocatorT, ReadT>(
  locator: ProviderToken<LocatorT> | string,
  opts: QueryOptions<ReadT> & { read: ProviderToken<ReadT> | string },
): Signal<readonly ReadT[]>;
export function viewChildren<LocatorT>(
  locator: ProviderToken<LocatorT> | string,
  opts?: QueryOptions<LocatorT>,
): Signal<readonly LocatorT[]>;
export function viewChildren<LocatorT, ReadT = LocatorT>(
  locator: ProviderToken<LocatorT> | string,
  opts?: QueryOptions<ReadT>,
): Signal<readonly ReadT[]> {
  return createMultiQuerySignal<LocatorT, ReadT>(
    "viewChildren",
    locator,
    true,
    opts,
  );
}

export interface ContentChildFunction {
  <LocatorT>(
    locator: ProviderToken<LocatorT> | string,
  ): Signal<LocatorT | undefined>;
  <LocatorT, ReadT>(
    locator: ProviderToken<LocatorT> | string,
    opts: ContentChildOptions<ReadT> & { read: ProviderToken<ReadT> | string },
  ): Signal<ReadT | undefined>;
  <LocatorT>(
    locator: ProviderToken<LocatorT> | string,
    opts?: ContentChildOptions<LocatorT>,
  ): Signal<LocatorT | undefined>;
  required: {
    <LocatorT>(locator: ProviderToken<LocatorT> | string): Signal<LocatorT>;
    <LocatorT, ReadT>(
      locator: ProviderToken<LocatorT> | string,
      opts: ContentChildOptions<ReadT> & {
        read: ProviderToken<ReadT> | string;
      },
    ): Signal<ReadT>;
    <LocatorT>(
      locator: ProviderToken<LocatorT> | string,
      opts?: ContentChildOptions<LocatorT>,
    ): Signal<LocatorT>;
  };
}

export const contentChild: ContentChildFunction = Object.assign(
  function contentChildImpl<LocatorT, ReadT = LocatorT>(
    locator: ProviderToken<LocatorT> | string,
    opts?: ContentChildOptions<ReadT>,
  ): Signal<ReadT | undefined> {
    return createSingleQuerySignal<LocatorT, ReadT | undefined>(
      "contentChild",
      locator,
      false,
      opts?.descendants ?? true,
      opts as QueryOptions<ReadT | undefined>,
    );
  },
  {
    required<LocatorT, ReadT = LocatorT>(
      locator: ProviderToken<LocatorT> | string,
      opts?: ContentChildOptions<ReadT>,
    ): Signal<ReadT> {
      return createSingleQuerySignal<LocatorT, ReadT>(
        "contentChild",
        locator,
        true,
        opts?.descendants ?? true,
        opts,
      );
    },
  },
) as ContentChildFunction;

export function contentChildren<LocatorT>(
  locator: ProviderToken<LocatorT> | string,
): Signal<readonly LocatorT[]>;
export function contentChildren<LocatorT, ReadT>(
  locator: ProviderToken<LocatorT> | string,
  opts: ContentChildOptions<ReadT> & { read: ProviderToken<ReadT> | string },
): Signal<readonly ReadT[]>;
export function contentChildren<LocatorT>(
  locator: ProviderToken<LocatorT> | string,
  opts?: ContentChildOptions<LocatorT>,
): Signal<readonly LocatorT[]>;
export function contentChildren<LocatorT, ReadT = LocatorT>(
  locator: ProviderToken<LocatorT> | string,
  opts?: ContentChildOptions<ReadT>,
): Signal<readonly ReadT[]> {
  return createMultiQuerySignal<LocatorT, ReadT>(
    "contentChildren",
    locator,
    opts?.descendants ?? false,
    opts,
  );
}

export function applyQueryValue<T>(target: Signal<T>, value: T): void {
  const ctrl = queryControllers.get(target);
  if (!ctrl) {
    throw new TypeError("Target is not an Angular signal query");
  }
  ctrl.applyValue(value);
}

export function getQueryMetadata(
  target: Signal<unknown>,
): QueryMetadata | undefined {
  return queryControllers.get(target)?.metadata;
}
