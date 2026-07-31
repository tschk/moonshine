"use client";

/**
 * Remix hooks bridged to moonshine signals (requires @remix-run/react).
 */
import { useEffect, useMemo } from "react";
import {
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "@remix-run/react";
import { createSignal, useSignal, type Signal } from "@tschk/moonshine/react";

export function useLoaderDataSignal<T>(): Signal<T> {
  const data = useLoaderData<T>();
  const signal = useMemo(() => createSignal(data), []);
  useEffect(() => {
    signal.set(() => data);
  }, [data, signal]);
  return signal;
}

export function useLocationSignal(): Signal<{
  pathname: string;
  search: string;
}> {
  const loc = useLocation();
  const signal = useMemo(
    () => createSignal({ pathname: loc.pathname, search: loc.search }),
    [],
  );
  useEffect(() => {
    signal.set({ pathname: loc.pathname, search: loc.search });
  }, [loc.pathname, loc.search, signal]);
  return signal;
}

export function useMoonshineNavigate(): {
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  revalidate: () => void;
} {
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  return {
    navigate: (to, opts) => navigate(to, opts),
    revalidate: () => revalidate(),
  };
}

export function useFetcherSignals<T = unknown>(): {
  state: Signal<"idle" | "submitting" | "loading">;
  data: Signal<T | undefined>;
  fetcher: ReturnType<typeof useFetcher<T>>;
} {
  const fetcher = useFetcher<T>();
  const state = useMemo(
    () => createSignal(fetcher.state as "idle" | "submitting" | "loading"),
    [],
  );
  const data = useMemo(() => createSignal(fetcher.data as T | undefined), []);
  useEffect(() => {
    state.set(fetcher.state as "idle" | "submitting" | "loading");
    data.set(() => fetcher.data as T | undefined);
  }, [fetcher.state, fetcher.data, state, data]);
  return { state, data, fetcher };
}

export { useSignal };
