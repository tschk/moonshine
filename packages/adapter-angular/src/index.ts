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
  resource,
  signal,
  toObservable,
  toSignal,
  untracked,
} from "./signals";
export type {
  AngularResource,
  AngularResourceStatus,
  AngularSignal,
  CreateComputedOptions,
  CreateEffectOptions,
  CreateSignalOptions,
  EffectCleanupFn,
  EffectCleanupRegisterFn,
  EffectRef,
  InteropObservable,
  LinkedSignalOptions,
  Observer,
  ResourceLoader,
  ResourceLoaderParams,
  ResourceOptions,
  ResourceRef,
  Signal,
  Subscribable,
  SubscriptionCleanup,
  ToSignalOptions,
  Unsubscribable,
  ValueEqualityFn,
  WritableResource,
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
