/**
 * @tschk/moonshine-angular
 *
 * Angular-like `signal` / `computed` / `effect` API over moonshine.
 * No `@angular/core` dependency — API shape only.
 */
import {
  createMemo,
  createResource,
  createSignal,
  untrack,
  type Memo,
  type Resource,
  type Signal as MsSignal,
} from "@tschk/moonshine";
import { effect as runeEffect } from "@tschk/moonshine/runes";

export type WritableSignal<T> = {
  (): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  asReadonly(): () => T;
  subscribe(fn: (value: T) => void): () => void;
};

export type SignalGetter<T> = {
  (): T;
  subscribe?(fn: (value: T) => void): () => void;
};

/** Angular `signal()` */
export function signal<T>(initial: T): WritableSignal<T> {
  const s = createSignal(initial);
  const api = (() => s()) as WritableSignal<T>;
  api.set = (value) => s.set(value);
  api.update = (fn) => s.set(fn);
  api.asReadonly = () => () => s.peek();
  api.subscribe = (fn) => s.subscribe(() => fn(s()));
  return api;
}

/** Angular `computed()` */
export function computed<T>(fn: () => T): SignalGetter<T> {
  const m: Memo<T> = createMemo(fn);
  const api = (() => m()) as SignalGetter<T>;
  api.subscribe = (listener) => m.subscribe(() => listener(m()));
  return api;
}

/** Angular `effect()` — returns teardown. */
export function effect(fn: () => void): () => void {
  return runeEffect(fn);
}

/** Angular `untracked()` */
export function untracked<T>(fn: () => T): T {
  return untrack(fn);
}

/** Resource via Angular-ish naming. */
export function resource<T>(
  fetcher: () => Promise<T>,
  opts?: { initial?: T; immediate?: boolean },
): Resource<T> {
  return createResource(fetcher, opts);
}

/** Adapt an existing moonshine signal. */
export function asAngularSignal<T>(s: MsSignal<T>): WritableSignal<T> {
  const api = (() => s()) as WritableSignal<T>;
  api.set = (value) => s.set(value);
  api.update = (fn) => s.set(fn);
  api.asReadonly = () => () => s.peek();
  api.subscribe = (fn) => s.subscribe(() => fn(s()));
  return api;
}

export {
  batch,
  createMemo,
  createSignal,
  createStore,
  createResource,
  untrack,
} from "@tschk/moonshine";
export type { Memo, Signal, StoreSetter, Resource } from "@tschk/moonshine";
export { state, derived } from "@tschk/moonshine/runes";
export { fromSignal, toSignal } from "./rxjs";
export type { ObservableLike } from "./rxjs";
