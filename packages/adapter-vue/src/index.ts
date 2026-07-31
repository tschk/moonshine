/**
 * @tschk/moonshine-vue
 *
 * Vue 3 ref/computed/watch bridge over moonshine signals + resources.
 */
import {
  createMemo,
  createResource,
  createSignal,
  type Memo,
  type Resource,
  type Signal,
} from "@tschk/moonshine";
import {
  computed,
  customRef,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";

function autoDispose(stop: () => void): void {
  if (getCurrentScope()) onScopeDispose(stop);
}

/** Bind a moonshine signal to a Vue ref. */
export function refFromSignal<T>(signal: Signal<T>): Ref<T> {
  return customRef((track, trigger) => {
    const stop = signal.subscribe(() => trigger());
    autoDispose(stop);
    return {
      get() {
        track();
        return signal();
      },
      set(value: T) {
        signal.set(value);
        trigger();
      },
    };
  });
}

/** Create a Vue ref backed by a new moonshine signal. */
export function moonshineRef<T>(initial: T): Ref<T> {
  return refFromSignal(createSignal(initial));
}

/** Derive a Vue computed from a moonshine memo. */
export function computedFromMemo<T>(memo: Memo<T>): ComputedRef<T> {
  return computed(() => memo());
}

export function moonshineComputed<T>(fn: () => T): ComputedRef<T> {
  return computedFromMemo(createMemo(fn));
}

/** Watch a moonshine signal with Vue `watch` semantics. */
export function watchSignal<T>(
  signal: Signal<T>,
  cb: (value: T, prev: T | undefined) => void,
): () => void {
  let prev: T | undefined = signal.peek();
  cb(prev, undefined);
  return signal.subscribe(() => {
    const next = signal();
    cb(next, prev);
    prev = next;
  });
}

/** Vue shallowRef mirror of a Resource (data + loading). */
export function resourceRefs<T>(resource: Resource<T>): {
  data: ShallowRef<T | undefined>;
  loading: Ref<boolean>;
  error: ShallowRef<Error | undefined>;
  refetch: () => Promise<T | undefined>;
} {
  const data = shallowRef(resource.peek());
  const loading = moonshineRef(resource.loading.peek());
  const error = shallowRef(resource.error.peek());
  const stop1 = resource.subscribe(() => {
    data.value = resource();
  });
  const stop2 = resource.loading.subscribe(() => {
    loading.value = resource.loading();
  });
  const stop3 = resource.error.subscribe(() => {
    error.value = resource.error();
  });
  autoDispose(() => {
    stop1();
    stop2();
    stop3();
  });
  return { data, loading, error, refetch: () => resource.refetch() };
}

export function moonshineResource<T>(
  fetcher: () => Promise<T>,
  opts?: { initial?: T; immediate?: boolean },
): Resource<T> {
  return createResource(fetcher, opts);
}

export {
  batch,
  createMemo,
  createResource,
  createSignal,
  createStore,
  untrack,
} from "@tschk/moonshine";
export type {
  Memo,
  Resource,
  Signal,
  StoreSetter,
} from "@tschk/moonshine";

export { state, derived, effect } from "@tschk/moonshine/runes";

// re-export watch name clash avoid
export { watch };
