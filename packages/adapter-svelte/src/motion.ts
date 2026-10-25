/** Independent host-free Svelte 5 motion primitives (`svelte/motion`). */
import { createSignal, untrack } from "@tschk/moonshine";
import {
  createComputed,
  getOwner,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { linear, type EasingFunction } from "./easing";
import { MediaQuery } from "./reactivity";
import {
  writable,
  type Readable,
  type Subscriber,
  type Unsubscriber,
} from "./store";

export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  precision?: number;
}

export interface SpringUpdateOptions {
  hard?: boolean;
  soft?: boolean | number;
  preserveMomentum?: number;
}

export interface TweenedOptions<T> {
  delay?: number;
  duration?: number | ((from: T, to: T) => number);
  easing?: EasingFunction;
  interpolate?: (a: T, b: T) => (t: number) => T;
}

function defaultInterpolate<T>(a: T, b: T): (t: number) => T {
  if (a === b || a !== a) return () => a;
  const type = typeof a;
  if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    throw new TypeError("Cannot interpolate values of different types");
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const interpolators = b.map((bi, i) => defaultInterpolate(a[i], bi));
    return (t: number) => interpolators.map((fn) => fn(t)) as unknown as T;
  }
  if (type === "object" && a !== null && b !== null) {
    if (a instanceof Date && b instanceof Date) {
      const fromTime = a.getTime();
      const toTime = b.getTime();
      const delta = toTime - fromTime;
      return (t: number) => new Date(fromTime + t * delta) as unknown as T;
    }
    const keys = Object.keys(b as object);
    const interpolators: Record<string, (t: number) => unknown> = {};
    for (const k of keys) {
      interpolators[k] = defaultInterpolate(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      );
    }
    return (t: number) => {
      const res: Record<string, unknown> = {};
      for (const k of keys) {
        res[k] = interpolators[k]!(t);
      }
      return res as unknown as T;
    };
  }
  if (type === "number") {
    const fromNum = a as unknown as number;
    const delta = (b as unknown as number) - fromNum;
    return (t: number) => (fromNum + t * delta) as unknown as T;
  }
  throw new TypeError(`Cannot interpolate ${type} values`);
}

function cloneMotionValue<T>(value: T): T {
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneMotionValue(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = cloneMotionValue(v);
    }
    return out as unknown as T;
  }
  return value;
}

function stepSpringValue<T>(
  current: T,
  last: T,
  target: T,
  stiffness: number,
  damping: number,
  precision: number,
  dt: number,
): { value: T; settled: boolean } {
  if (typeof target === "number" && typeof current === "number") {
    const lastNum = typeof last === "number" ? last : current;
    const d = target - current;
    const velocity = (current - lastNum) / (dt || 1 / 60);
    const springForce = stiffness * d;
    const damperForce = damping * velocity;
    const acceleration = (springForce - damperForce) * dt;
    const nextDelta = (velocity + acceleration) * dt;
    if (Math.abs(nextDelta) < precision && Math.abs(d) < precision) {
      return { value: target, settled: true };
    }
    return {
      value: (current + nextDelta) as unknown as T,
      settled: false,
    };
  }
  if (target instanceof Date && current instanceof Date) {
    const lastDate = last instanceof Date ? last : current;
    const step = stepSpringValue(
      current.getTime(),
      lastDate.getTime(),
      target.getTime(),
      stiffness,
      damping,
      precision,
      dt,
    );
    return {
      value: new Date(step.value) as unknown as T,
      settled: step.settled,
    };
  }
  if (Array.isArray(target) && Array.isArray(current)) {
    const lastArr = Array.isArray(last) ? last : current;
    let allSettled = true;
    const nextArr = target.map((tItem, i) => {
      const step = stepSpringValue(
        current[i],
        lastArr[i],
        tItem,
        stiffness,
        damping,
        precision,
        dt,
      );
      if (!step.settled) allSettled = false;
      return step.value;
    });
    return { value: nextArr as unknown as T, settled: allSettled };
  }
  if (
    target !== null &&
    typeof target === "object" &&
    current !== null &&
    typeof current === "object"
  ) {
    const lastObj =
      last !== null && typeof last === "object"
        ? (last as Record<string, unknown>)
        : (current as Record<string, unknown>);
    let allSettled = true;
    const nextObj: Record<string, unknown> = {};
    for (const k of Object.keys(target as object)) {
      const step = stepSpringValue(
        (current as Record<string, unknown>)[k],
        lastObj[k],
        (target as Record<string, unknown>)[k],
        stiffness,
        damping,
        precision,
        dt,
      );
      if (!step.settled) allSettled = false;
      nextObj[k] = step.value;
    }
    return { value: nextObj as unknown as T, settled: allSettled };
  }
  return { value: target, settled: true };
}

export class Spring<T> {
  stiffness: number;
  damping: number;
  precision: number;

  readonly #currentSig;
  readonly #targetSig;
  #lastValue: T;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pendingResolve: (() => void) | undefined;

  constructor(value: T, options: SpringOptions = {}) {
    this.stiffness = options.stiffness ?? 0.15;
    this.damping = options.damping ?? 0.8;
    this.precision = options.precision ?? 0.01;
    const initial = cloneMotionValue(value);
    this.#currentSig = createSignal<T>(initial);
    this.#targetSig = createSignal<T>(cloneMotionValue(value));
    this.#lastValue = cloneMotionValue(value);
  }

  static of<U>(fn: () => U, options?: SpringOptions): Spring<U> {
    const instance = new Spring<U>(untrack(fn), options);
    if (getOwner()) {
      let first = true;
      createComputed(() => {
        const next = fn();
        if (first) {
          first = false;
          return;
        }
        untrack(() => {
          void instance.set(next);
        });
      });
      onCleanup(() => {
        instance.#cancel();
      });
    }
    return instance;
  }

  get current(): T {
    return this.#currentSig();
  }

  get target(): T {
    return this.#targetSig();
  }

  set target(value: T) {
    void this.set(value);
  }

  #cancel(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (this.#pendingResolve) {
      const res = this.#pendingResolve;
      this.#pendingResolve = undefined;
      res();
    }
  }

  set(newValue: T, options?: SpringUpdateOptions): Promise<void> {
    this.#targetSig.set(() => cloneMotionValue(newValue));
    this.#cancel();

    if (options?.hard || (this.stiffness >= 1 && this.damping >= 1)) {
      const cloned = cloneMotionValue(newValue);
      this.#lastValue = cloneMotionValue(newValue);
      this.#currentSig.set(() => cloned);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.#pendingResolve = resolve;
      let steps = 0;
      const tick = () => {
        steps++;
        const current = untrack(this.#currentSig);
        const target = untrack(this.#targetSig);
        const { value: next, settled } = stepSpringValue(
          current,
          this.#lastValue,
          target,
          this.stiffness,
          this.damping,
          this.precision,
          1 / 60,
        );
        this.#lastValue = current;
        this.#currentSig.set(() => next);
        if (settled || steps >= 120) {
          this.#currentSig.set(() => cloneMotionValue(target));
          this.#lastValue = cloneMotionValue(target);
          this.#timer = undefined;
          const done = this.#pendingResolve;
          this.#pendingResolve = undefined;
          done?.();
          return;
        }
        this.#timer = setTimeout(tick, 4);
      };
      this.#timer = setTimeout(tick, 4);
    });
  }
}

export class Tween<T> {
  readonly #currentSig;
  readonly #targetSig;
  readonly #defaults: TweenedOptions<T>;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pendingResolve: (() => void) | undefined;

  constructor(value: T, options: TweenedOptions<T> = {}) {
    this.#defaults = options;
    this.#currentSig = createSignal<T>(cloneMotionValue(value));
    this.#targetSig = createSignal<T>(cloneMotionValue(value));
  }

  static of<U>(fn: () => U, options?: TweenedOptions<U>): Tween<U> {
    const instance = new Tween<U>(untrack(fn), options);
    if (getOwner()) {
      let first = true;
      createComputed(() => {
        const next = fn();
        if (first) {
          first = false;
          return;
        }
        untrack(() => {
          void instance.set(next);
        });
      });
      onCleanup(() => {
        instance.#cancel();
      });
    }
    return instance;
  }

  get current(): T {
    return this.#currentSig();
  }

  get target(): T {
    return this.#targetSig();
  }

  set target(value: T) {
    void this.set(value);
  }

  #cancel(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (this.#pendingResolve) {
      const res = this.#pendingResolve;
      this.#pendingResolve = undefined;
      res();
    }
  }

  set(newValue: T, options?: TweenedOptions<T>): Promise<void> {
    const merged: TweenedOptions<T> = { ...this.#defaults, ...options };
    const fromVal = untrack(this.#currentSig);
    this.#targetSig.set(() => cloneMotionValue(newValue));
    this.#cancel();

    const duration =
      typeof merged.duration === "function"
        ? merged.duration(fromVal, newValue)
        : (merged.duration ?? 400);
    const delay = merged.delay ?? 0;
    const easing = merged.easing ?? linear;
    const interpolate =
      merged.interpolate ??
      (defaultInterpolate as (a: T, b: T) => (t: number) => T);

    if (duration <= 0 && delay <= 0) {
      this.#currentSig.set(() => cloneMotionValue(newValue));
      return Promise.resolve();
    }

    const fn = interpolate(fromVal, newValue);
    const startTime = performance.now() + delay;

    return new Promise<void>((resolve) => {
      this.#pendingResolve = resolve;
      const step = () => {
        const now = performance.now();
        if (now < startTime) {
          this.#timer = setTimeout(step, 4);
          return;
        }
        const elapsed = now - startTime;
        if (duration <= 0 || elapsed >= duration) {
          this.#currentSig.set(() => cloneMotionValue(newValue));
          this.#timer = undefined;
          const done = this.#pendingResolve;
          this.#pendingResolve = undefined;
          done?.();
          return;
        }
        const progress = easing(elapsed / duration);
        this.#currentSig.set(() => fn(progress));
        this.#timer = setTimeout(step, 4);
      };
      this.#timer = setTimeout(step, 4);
    });
  }
}

export interface SpringStore<T> extends Readable<T> {
  set(newValue: T, opts?: SpringUpdateOptions): Promise<void>;
  update(
    fn: (target: T, value: T) => T,
    opts?: SpringUpdateOptions,
  ): Promise<void>;
  precision: number;
  damping: number;
  stiffness: number;
}

export function spring<T = any>(
  value?: T,
  opts: SpringOptions = {},
): SpringStore<T> {
  const store = writable<T>(value as T);
  const instance = new Spring<T>(value as T, opts);
  let currentVal = value as T;
  let targetVal = value as T;

  return {
    subscribe(run: Subscriber<T>, invalidate?: () => void): Unsubscriber {
      return store.subscribe(run, invalidate);
    },
    async set(newValue: T, updateOpts?: SpringUpdateOptions): Promise<void> {
      targetVal = newValue;
      instance.stiffness = this.stiffness;
      instance.damping = this.damping;
      instance.precision = this.precision;
      if (updateOpts?.hard || (this.stiffness >= 1 && this.damping >= 1)) {
        currentVal = cloneMotionValue(newValue);
        store.set(currentVal);
        return;
      }
      const p = instance.set(newValue, updateOpts);
      store.set(instance.current);
      await p;
      currentVal = instance.current;
      store.set(currentVal);
    },
    update(
      fn: (target: T, value: T) => T,
      updateOpts?: SpringUpdateOptions,
    ): Promise<void> {
      return this.set(fn(targetVal, currentVal), updateOpts);
    },
    stiffness: opts.stiffness ?? 0.15,
    damping: opts.damping ?? 0.8,
    precision: opts.precision ?? 0.01,
  };
}

export interface Tweened<T> extends Readable<T> {
  set(value: T, opts?: TweenedOptions<T>): Promise<void>;
  update(
    updater: (target: T, value: T) => T,
    opts?: TweenedOptions<T>,
  ): Promise<void>;
}

export function tweened<T = any>(
  value?: T,
  defaults: TweenedOptions<T> = {},
): Tweened<T> {
  const store = writable<T>(value as T);
  const instance = new Tween<T>(value as T, defaults);
  let currentVal = value as T;
  let targetVal = value as T;

  return {
    subscribe(run: Subscriber<T>, invalidate?: () => void): Unsubscriber {
      return store.subscribe(run, invalidate);
    },
    async set(newValue: T, opts?: TweenedOptions<T>): Promise<void> {
      targetVal = newValue;
      const merged = { ...defaults, ...opts };
      const duration =
        typeof merged.duration === "function"
          ? merged.duration(currentVal, newValue)
          : (merged.duration ?? 400);
      if (duration <= 0 && (merged.delay ?? 0) <= 0) {
        currentVal = cloneMotionValue(newValue);
        store.set(currentVal);
        return;
      }
      const p = instance.set(newValue, opts);
      await p;
      currentVal = instance.current;
      store.set(currentVal);
    },
    update(
      updater: (target: T, value: T) => T,
      opts?: TweenedOptions<T>,
    ): Promise<void> {
      return this.set(updater(targetVal, currentVal), opts);
    },
  };
}

export const prefersReducedMotion: MediaQuery = new MediaQuery(
  "(prefers-reduced-motion: reduce)",
  false,
);
