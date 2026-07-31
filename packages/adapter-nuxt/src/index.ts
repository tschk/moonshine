/**
 * @tschk/moonshine-nuxt
 *
 * Moonshine + Nuxt libraries (`/app` → `#app` composables).
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

export function useMoonshineRef<T>(initial: T): Ref<T> {
  return moonshineRef(initial);
}

export function useMoonshineComputed<T>(fn: () => T): ComputedRef<T> {
  return moonshineComputed(fn);
}

const stateBag = new Map<string, Ref<unknown>>();

export function useMoonshineState<T>(key: string, init: () => T): Ref<T> {
  let ref = stateBag.get(key) as Ref<T> | undefined;
  if (!ref) {
    ref = moonshineRef(init());
    stateBag.set(key, ref as Ref<unknown>);
  }
  return ref;
}

const asyncBag = new Map<string, Resource<unknown>>();

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

export function clearMoonshineNuxtState(): void {
  stateBag.clear();
  asyncBag.clear();
}

export type { ComputedRef, Ref, ShallowRef };
