/** Native signal bridges, Nuxt composables, and a lazy native renderer; host APIs remain on legacy subpaths. */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export {
  clearNuxtData,
  clearNuxtState,
  createBridgedRef,
  defineNuxtPlugin,
  defineNuxtRouteMiddleware,
  definePageMeta,
  fromMoonshineSignal,
  isNuxtRef,
  refreshNuxtData,
  useAsyncData,
  useLazyAsyncData,
  useNuxtData,
  useState,
} from "./composables";
export type {
  AsyncData,
  AsyncDataExecuteOptions,
  AsyncDataObject,
  AsyncDataOptions,
  AsyncDataRequestStatus,
  VueRef,
} from "./composables";

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
