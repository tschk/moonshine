/** Native signal bridges and a lazy native renderer; host APIs remain on legacy subpaths. */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export type Readable<T> = {
  get: () => T;
  subscribe: (fn: (value: T) => void) => () => void;
};

export function fromMoonshineSignal<T>(signal: MsSignal<T>): Readable<T> {
  return {
    get: () => signal(),
    subscribe: (fn) => {
      fn(signal());
      return signal.subscribe(() => fn(signal()));
    },
  };
}

export function createBridgedReadable<T>(initial: T): Readable<T> {
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
