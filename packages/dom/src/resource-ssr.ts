/** Synchronous server resources: sources are read, fetchers never run. */
import { peekComponentContext } from "./component";
import { untrack, type Accessor } from "./reactive";
import type {
  Resource,
  ResourceFetcher,
  ResourceOptions,
  ResourceSource,
  ResourceState,
} from "./resource";
import { isSSRRendering } from "./ssr-owner";

export type ServerResourceActions<T, R = unknown> = {
  mutate: (value: T | undefined) => T | undefined;
  refetch: (info?: R) => boolean;
};
export type ServerResourceReturn<T, R = unknown> = [
  Resource<T>,
  ServerResourceActions<T, R>,
];

export function createResource<T, R = unknown>(
  fetcher: ResourceFetcher<true, T, R>,
  options?: ResourceOptions<T>,
): ServerResourceReturn<T, R>;
export function createResource<T, S, R = unknown>(
  source: ResourceSource<S>,
  fetcher: ResourceFetcher<S, T, R>,
  options?: ResourceOptions<T>,
): ServerResourceReturn<T, R>;
export function createResource<T, S, R = unknown>(
  sourceOrFetcher: ResourceSource<S> | ResourceFetcher<true, T, R>,
  fetcherOrOptions?: ResourceFetcher<S, T, R> | ResourceOptions<T>,
  suppliedOptions?: ResourceOptions<T>,
): ServerResourceReturn<T, R> {
  if (!isSSRRendering() && peekComponentContext()?.mode !== "ssr")
    throw new Error(
      "Server createResource requires an active SSR render or SSR component context",
    );
  const hasSource = typeof fetcherOrOptions === "function";
  const options = (hasSource ? suppliedOptions : fetcherOrOptions) as
    ResourceOptions<T> | undefined;
  for (const key of Object.keys(options ?? {})) {
    if (key !== "initialValue" && key !== "name")
      throw new TypeError(`Unsupported native resource option: ${key}`);
  }
  const source = hasSource ? sourceOrFetcher : true;
  const seeded = options != null && "initialValue" in options;
  const state: ResourceState = seeded ? "ready" : "unresolved";
  let value = seeded ? options?.initialValue : undefined;
  let loading = false;

  function load(): boolean {
    return (loading = !!(typeof source === "function"
      ? untrack(source as Accessor<unknown>)
      : source));
  }
  load();
  const read = (() => value) as Resource<T>;
  Object.defineProperties(read, {
    state: { value: state },
    loading: { get: () => loading },
    error: { value: undefined },
    latest: { get: read },
  });
  return [
    read,
    {
      mutate: (next) => (value = next),
      refetch: load,
    },
  ];
}
