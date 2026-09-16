/**
 * @tschk/moonshine-angular
 *
 * Hosting adapter: Angular compiles templates and the component class.
 * Moonshine cannot replace that compiler. `@angular/core` and
 * `@angular/common` are peers, re-exported on subpaths, with moonshine
 * signal bridges onto an Angular-signal shape.
 */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export type AngularSignal<T> = {
  (): T;
  set: (value: T) => void;
  update: (fn: (value: T) => T) => void;
};

export function fromMoonshineSignal<T>(signal: MsSignal<T>): AngularSignal<T> {
  const read = (() => signal()) as AngularSignal<T>;
  read.set = (value) => {
    signal.set(value);
  };
  read.update = (fn) => {
    signal.set(fn(signal.peek()));
  };
  return read;
}

export function createBridgedSignal<T>(initial: T): AngularSignal<T> {
  return fromMoonshineSignal(msCreateSignal(initial));
}

export { msCreateSignal as createMoonshineSignal };
export type { MsSignal as MoonshineSignal };
export {
  createResource,
  createSignal as createMsSignal,
  createMemo,
  batch,
  untrack,
} from "@tschk/moonshine";
export type { Resource, ResourceStatus } from "@tschk/moonshine";
export { crepusRenderer } from "@tschk/crepus-moonshine";
