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
  if (!options?.manualCleanup && outer?.disposed) {
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
                  if (options?.allowSignalWrites === false) {
                    withWritesDisallowed(() => effectFn(registerCleanup));
                  } else {
                    effectFn(registerCleanup);
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

  if (outer && !options?.manualCleanup) {
    domOnCleanup(destroy);
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
