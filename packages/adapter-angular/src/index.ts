/**
 * @tschk/moonshine-angular
 *
 * Angular-like API: moonshine signals in a shape familiar to zoneless
 * Angular `signal()` consumers. No `@angular/core` dependency.
 */

import {
  createMemo,
  createSignal,
  type Memo,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export type AngularSignalLike<T> = {
  (): T;
  set: (value: T) => void;
  update: (fn: (prev: T) => T) => void;
  /** Angular-style read without consumer tracking when used outside effects. */
  asReadonly: () => () => T;
  subscribe: (fn: (value: T) => void) => () => void;
};

/** Adapt a moonshine signal to an Angular-like signal API. */
export function asAngularSignal<T>(signal: MsSignal<T>): AngularSignalLike<T> {
  const api = (() => signal()) as AngularSignalLike<T>;
  api.set = (value) => signal.set(value);
  api.update = (fn) => signal.set(fn);
  api.asReadonly = () => () => signal.peek();
  api.subscribe = (fn) => signal.subscribe(() => fn(signal()));
  return api;
}

export function moonshineSignal<T>(initial: T): AngularSignalLike<T> {
  return asAngularSignal(createSignal(initial));
}

export function moonshineComputed<T>(fn: () => T): Memo<T> {
  return createMemo(fn);
}

/** Alias matching Angular `computed()`. */
export const computed = moonshineComputed;
/** Alias matching Angular `signal()`. */
export const signal = moonshineSignal;

export { createSignal, createMemo, createStore, batch, untrack } from "@tschk/moonshine";
export type { MsSignal as MoonshineSignal, Memo, StoreSetter } from "@tschk/moonshine";
export { state, derived, effect } from "@tschk/moonshine/runes";
