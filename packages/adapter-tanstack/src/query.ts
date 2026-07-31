"use client";

/**
 * @tanstack/react-query + moonshine signal bridges.
 */
import { useEffect, useMemo } from "react";
import {
  useMutation as useTQMutation,
  useQuery as useTQQuery,
  useQueryClient as useTQQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createSignal, useSignal, type Signal } from "@tschk/moonshine/react";

export {
  useTQQuery as useQuery,
  useTQMutation as useMutation,
  useTQQueryClient as useQueryClient,
};

export type { UseQueryOptions, UseQueryResult };

/** Mirror query data into a moonshine signal. */
export function useQuerySignal<TData>(options: UseQueryOptions<TData>): {
  data: Signal<TData | undefined>;
  isLoading: Signal<boolean>;
  error: Signal<Error | null>;
  query: UseQueryResult<TData>;
} {
  const query = useTQQuery(options);
  const data = useMemo(() => createSignal(query.data), []);
  const isLoading = useMemo(() => createSignal(query.isLoading), []);
  const error = useMemo(() => createSignal(query.error), []);
  useEffect(() => {
    data.set(() => query.data);
    isLoading.set(query.isLoading);
    error.set(() => query.error);
  }, [query.data, query.isLoading, query.error, data, isLoading, error]);
  return { data, isLoading, error, query };
}

/** Reactive read of query data via useSignal. */
export function useReactiveQueryData<TData>(
  options: UseQueryOptions<TData>,
): TData | undefined {
  const { data } = useQuerySignal(options);
  return useSignal(data);
}
