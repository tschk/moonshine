/** Client resources without Suspense, hydration, or asynchronous SSR. */
import { peekComponentContext } from "./component";
import {
  batch,
  createComputed,
  createMemo,
  createSignal,
  getOwner,
  runWithOwner,
  onCleanup,
  untrack,
  type Accessor,
  type Setter,
} from "./reactive";
import { isSSRRendering } from "./ssr-owner";

export type ResourceState =
  "unresolved" | "pending" | "ready" | "refreshing" | "errored";
export type Resource<T> = Accessor<T | undefined> & {
  readonly state: ResourceState;
  readonly loading: boolean;
  readonly error: Error | undefined;
  readonly latest: T | undefined;
};
export type ResourceSource<S> =
  S | false | null | undefined | Accessor<S | false | null | undefined>;
export type ResourceFetcher<S, T, R = unknown> = (
  source: S,
  info: { value: T | undefined; refetching: R | boolean },
) => T | PromiseLike<T>;
export type ResourceOptions<T> = { initialValue?: T; name?: string };
export type ResourceActions<T, R = unknown> = {
  mutate: Setter<T | undefined>;
  refetch: (info?: R) => T | Promise<T | undefined> | undefined;
};
export type ResourceReturn<T, R = unknown> = [
  Resource<T>,
  ResourceActions<T, R>,
];

export function createResource<T, R = unknown>(
  fetcher: ResourceFetcher<true, T, R>,
  options?: ResourceOptions<T>,
): ResourceReturn<T, R>;
export function createResource<T, S, R = unknown>(
  source: ResourceSource<S>,
  fetcher: ResourceFetcher<S, T, R>,
  options?: ResourceOptions<T>,
): ResourceReturn<T, R>;
export function createResource<T, S, R = unknown>(
  sourceOrFetcher: ResourceSource<S> | ResourceFetcher<true, T, R>,
  fetcherOrOptions?: ResourceFetcher<S, T, R> | ResourceOptions<T>,
  suppliedOptions?: ResourceOptions<T>,
): ResourceReturn<T, R> {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr")
    throw new Error(
      "Client createResource is unavailable during SSR; use createResource from the server resource module",
    );
  const hasSource = typeof fetcherOrOptions === "function";
  const source = (hasSource ? sourceOrFetcher : true) as ResourceSource<S>;
  const fetcher = (
    hasSource ? fetcherOrOptions : sourceOrFetcher
  ) as ResourceFetcher<S, T, R>;
  const options = (hasSource ? suppliedOptions : fetcherOrOptions) as
    ResourceOptions<T> | undefined;
  for (const key of Object.keys(options ?? {})) {
    if (key !== "initialValue" && key !== "name")
      throw new TypeError(`Unsupported native resource option: ${key}`);
  }
  const [value, setValue] = createSignal<T | undefined>(options?.initialValue);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  let resolved = options != null && "initialValue" in options;
  const [state, setState] = createSignal<ResourceState>(
    resolved ? "ready" : "unresolved",
  );
  let generation = 0;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    generation++;
  });
  const dynamic =
    typeof source === "function"
      ? createMemo(source as Accessor<S | false | null | undefined>)
      : undefined;
  let fetchOwner = getOwner();

  function publish(token: number, result: T | undefined, failure?: Error) {
    if (disposed || token !== generation) return;
    resolved = true;
    batch(() => {
      if (!failure) setValue(() => result);
      setError(failure);
      setState(failure ? "errored" : "ready");
    });
  }
  function load(
    refetching: R | boolean,
  ): T | Promise<T | undefined> | undefined {
    if (disposed) return untrack(value);
    const key = dynamic ? dynamic() : source;
    const token = ++generation;
    if (key == null || key === false) {
      batch(() => {
        setError(undefined);
        setState(resolved ? "ready" : "unresolved");
      });
      return undefined;
    }
    let result: T | PromiseLike<T>;
    let asynchronous: boolean;
    try {
      result = untrack(() => fetcher(key as S, { value: value(), refetching }));
      asynchronous =
        result != null &&
        (typeof result === "object" || typeof result === "function") &&
        typeof (result as PromiseLike<T>).then === "function";
    } catch (failure) {
      publish(
        token,
        undefined,
        failure instanceof Error ? failure : new Error(String(failure)),
      );
      return undefined;
    }
    if (!asynchronous) {
      publish(token, result as T);
      return result as T;
    }
    const pending = Promise.resolve(result).then(
      (next) => {
        publish(token, next);
        return next;
      },
      (failure) => {
        publish(
          token,
          undefined,
          failure instanceof Error ? failure : new Error(String(failure)),
        );
        return undefined;
      },
    );
    if (!disposed && token === generation)
      batch(() => {
        setState(resolved ? "refreshing" : "pending");
      });
    return pending;
  }
  const read = (() => {
    const current = value();
    const failure = error();
    if (failure) {
      const pending = state();
      if (pending !== "pending" && pending !== "refreshing") throw failure;
    }
    return current;
  }) as Resource<T>;
  Object.defineProperties(read, {
    state: { get: state },
    loading: {
      get: () => {
        const current = state();
        return current === "pending" || current === "refreshing";
      },
    },
    error: { get: error },
    latest: { get: read },
  });
  if (dynamic) {
    // Subscribe before the first fetcher can change its own source.
    let watching = false;
    createComputed(() => {
      fetchOwner = getOwner();
      dynamic();
      if (watching) void load(false);
    });
    watching = true;
    runWithOwner(fetchOwner, () =>
      untrack(() => {
        void load(false);
      }),
    );
  } else void load(false);
  return [
    read,
    {
      mutate: (next) => (disposed ? untrack(value) : setValue(next)),
      refetch: (info) =>
        runWithOwner(fetchOwner, () =>
          untrack(() => load(info === undefined ? true : info)),
        ),
    },
  ];
}
