/**
 * @tschk/moonshine-angular
 *
 * Angular-like API: expose moonshine signals in a shape familiar to
 * zoneless Angular `signal()` consumers. No `@angular/core` dependency.
 */

import {
  createSignal,
  createMemo,
  type Signal as MsSignal,
  type Memo,
} from "@tschk/moonshine";

export type AngularSignalLike<T> = {
  (): T;
  set: (value: T) => void;
  update: (fn: (prev: T) => T) => void;
  subscribe: (fn: (value: T) => void) => () => void;
};

/** Adapt a moonshine signal to an Angular-like signal API. */
export function asAngularSignal<T>(signal: MsSignal<T>): AngularSignalLike<T> {
  const api = (() => signal()) as AngularSignalLike<T>;
  api.set = (value) => signal.set(value);
  api.update = (fn) => signal.set(fn);
  api.subscribe = (fn) => signal.subscribe(() => fn(signal()));
  return api;
}

export function moonshineSignal<T>(initial: T): AngularSignalLike<T> {
  return asAngularSignal(createSignal(initial));
}

export function moonshineComputed<T>(fn: () => T): Memo<T> {
  return createMemo(fn);
}

export { createSignal, createMemo };
export type { MsSignal as MoonshineSignal, Memo };
