/** Native signal bridges, Nuxt composables, and a lazy native renderer; host APIs remain on legacy subpaths. */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";

export {
  NuxtError,
  callOnce,
  clearError,
  clearNuxtData,
  clearNuxtState,
  createBridgedRef,
  createError,
  createNuxtRequestEvent,
  defineNuxtPlugin,
  defineNuxtRouteMiddleware,
  definePageMeta,
  fromMoonshineSignal,
  isNuxtError,
  isNuxtRef,
  refreshCookie,
  refreshNuxtData,
  showError,
  updateAppConfig,
  useAppConfig,
  useAsyncData,
  useCookie,
  useError,
  useFetch,
  useLazyAsyncData,
  useLazyFetch,
  useNuxtData,
  useRequestEvent,
  useRequestHeaders,
  useRequestURL,
  useRuntimeConfig,
  useState,
  withNuxtRequest,
} from "./composables";
export type {
  AsyncData,
  AsyncDataExecuteOptions,
  AsyncDataObject,
  AsyncDataOptions,
  AsyncDataRequestStatus,
  CallOnceOptions,
  CookieOptions,
  CookieRef,
  FetchContext,
  MaybeReactive,
  NuxtRequestEvent,
  NuxtRequestInit,
  NuxtRuntimeConfig,
  UseFetchOptions,
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
