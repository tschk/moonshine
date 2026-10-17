/** Native signal bridges and a lazy native renderer; host APIs remain on legacy subpaths. */
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
    signal.set(() => value);
  };
  read.update = (fn) => {
    const next = fn(signal.peek());
    signal.set(() => next);
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
export { crepusRenderer } from "@tschk/moonshine-dom/framework-lazy";
