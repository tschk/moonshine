import { createSignal, type Signal } from "./signal";

export type ResourceStatus = "pending" | "ready" | "errored";

export type Resource<T> = {
  /** Current value (undefined until first success unless `initial` set). */
  (): T | undefined;
  /** true while a fetch is in flight. */
  loading: Signal<boolean>;
  /** Last error, if any. */
  error: Signal<Error | undefined>;
  /** Coarse status. */
  status: Signal<ResourceStatus>;
  /** Re-run the fetcher. */
  refetch: () => Promise<T | undefined>;
  peek: () => T | undefined;
  subscribe: (listener: () => void) => () => void;
};

export type CreateResourceOptions<T> = {
  /** Seed value before first fetch settles. */
  initial?: T;
  /** If false, do not fetch until `refetch()` (default true). */
  immediate?: boolean;
  /** Invoked when fetcher throws. */
  onError?: (error: Error) => void;
};

/**
 * Async resource backed by moonshine signals (Solid-inspired).
 *
 * ```ts
 * const users = createResource(() => fetch("/api/users").then((r) => r.json()));
 * users();           // data
 * users.loading();   // boolean
 * await users.refetch();
 * ```
 */
export function createResource<T>(
  fetcher: () => Promise<T>,
  options: CreateResourceOptions<T> = {},
): Resource<T> {
  const data = createSignal<T | undefined>(options.initial);
  const loading = createSignal(false);
  const error = createSignal<Error | undefined>(undefined);
  const status = createSignal<ResourceStatus>(
    options.initial !== undefined ? "ready" : "pending",
  );

  const refetch = async (): Promise<T | undefined> => {
    loading.set(true);
    status.set("pending");
    error.set(undefined);
    try {
      const value = await fetcher();
      data.set(() => value);
      status.set("ready");
      return value;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      error.set(err);
      status.set("errored");
      options.onError?.(err);
      return undefined;
    } finally {
      loading.set(false);
    }
  };

  if (options.immediate !== false) {
    void refetch();
  }

  const read = (() => data()) as Resource<T>;
  read.loading = loading;
  read.error = error;
  read.status = status;
  read.refetch = refetch;
  read.peek = () => data.peek();
  read.subscribe = data.subscribe;
  return read;
}
