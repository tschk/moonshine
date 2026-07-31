/**
 * @tschk/moonshine-nuxt
 *
 * Nuxt / Vue composable-style API over moonshine.
 */
export {
  batch,
  computedFromMemo,
  createMemo,
  createResource,
  createSignal,
  createStore,
  derived,
  effect,
  moonshineComputed,
  moonshineRef,
  moonshineResource,
  refFromSignal,
  resourceRefs,
  state,
  untrack,
  watchSignal,
} from "@tschk/moonshine-vue";

export type { Memo, Resource, Signal, StoreSetter } from "@tschk/moonshine-vue";

import {
  moonshineComputed,
  moonshineRef,
  moonshineResource,
  resourceRefs,
  type Resource,
} from "@tschk/moonshine-vue";
import type { ComputedRef, Ref, ShallowRef } from "vue";

/** Nuxt composable alias for `moonshineRef`. */
export function useMoonshineRef<T>(initial: T): Ref<T> {
  return moonshineRef(initial);
}

/** Nuxt composable alias for `moonshineComputed`. */
export function useMoonshineComputed<T>(fn: () => T): ComputedRef<T> {
  return moonshineComputed(fn);
}

/**
 * Shared client state by key (useState-like, module scope).
 * Survives component remounts within the same JS realm.
 */
const stateBag = new Map<string, Ref<unknown>>();

export function useMoonshineState<T>(key: string, init: () => T): Ref<T> {
  let ref = stateBag.get(key) as Ref<T> | undefined;
  if (!ref) {
    ref = moonshineRef(init());
    stateBag.set(key, ref as Ref<unknown>);
  }
  return ref;
}

/** Async data composable → resource + vue refs. */
export function useMoonshineAsyncData<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { immediate?: boolean; initial?: T },
): {
  data: ShallowRef<T | undefined>;
  loading: Ref<boolean>;
  error: ShallowRef<Error | undefined>;
  refresh: () => Promise<T | undefined>;
  resource: Resource<T>;
} {
  const cacheKey = `async:${key}`;
  let resource = asyncBag.get(cacheKey) as Resource<T> | undefined;
  if (!resource) {
    resource = moonshineResource(fetcher, opts);
    asyncBag.set(cacheKey, resource);
  }
  const refs = resourceRefs(resource);
  return {
    data: refs.data,
    loading: refs.loading,
    error: refs.error,
    refresh: refs.refetch,
    resource,
  };
}

const asyncBag = new Map<string, Resource<unknown>>();

/** Test helper */
export function clearMoonshineNuxtState(): void {
  stateBag.clear();
  asyncBag.clear();
}

export type { ComputedRef, Ref, ShallowRef };
