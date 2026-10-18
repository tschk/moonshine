"use client";

import { useSyncExternalStore } from "react";
import type { RouteDataState } from "./data";
import { useRouter } from "./navigation";
import type { MoonshineRouterInstance } from "./runtime";

/** Subscribe to the owning data runtime's complete state; loader errors stay in `error`. */
export function useRouteData(): RouteDataState<unknown> {
  const source = useRouter().data;
  if (!source) {
    throw new Error(
      "useRouteData requires a router with a data runtime; pass createDataRouter() as the MoonshineRouter runtime.",
    );
  }
  return useSyncExternalStore(source.subscribe, source.peek, source.peek);
}

/** Return the owning data runtime's action runner, stable per runtime. */
export function useRouteSubmit(): NonNullable<
  MoonshineRouterInstance["submit"]
> {
  const submit = useRouter().submit;
  if (!submit) {
    throw new Error(
      "useRouteSubmit requires a router with a data runtime; pass createDataRouter() as the MoonshineRouter runtime.",
    );
  }
  return submit;
}

/** Subscribe to the owning runtime's current submission state. */
export function useRouteSubmitting(): boolean {
  const source = useRouter().submitting;
  if (!source) {
    throw new Error(
      "useRouteSubmitting requires a router with a data runtime; pass createDataRouter() as the MoonshineRouter runtime.",
    );
  }
  return useSyncExternalStore(source.subscribe, source.peek, source.peek);
}
