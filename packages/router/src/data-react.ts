"use client";

import { useSyncExternalStore } from "react";
import type { RouteDataState } from "./data";
import { useRouter } from "./navigation";

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
