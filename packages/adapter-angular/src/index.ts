/** Native signal bridges and a lazy native renderer; host APIs remain on legacy subpaths. */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export {
  computed,
  createBridgedSignal,
  effect,
  fromMoonshineSignal,
  isSignal,
  isWritableSignal,
  linkedSignal,
  signal,
  untracked,
} from "./signals";
export type {
  AngularSignal,
  CreateComputedOptions,
  CreateEffectOptions,
  CreateSignalOptions,
  EffectCleanupFn,
  EffectCleanupRegisterFn,
  EffectRef,
  LinkedSignalOptions,
  Signal,
  ValueEqualityFn,
  WritableSignal,
} from "./signals";

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
