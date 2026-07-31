"use client";

/**
 * waku/router/client + moonshine signal bridge.
 */
import { useEffect, useMemo } from "react";
import {
  Link,
  useRouter_UNSTABLE,
} from "waku/router/client";
import { createSignal, type Signal } from "@tschk/moonshine/react";

export { Link, useRouter_UNSTABLE as useWakuRouter };

export function useWakuPathSignal(): Signal<string> {
  const router = useRouter_UNSTABLE();
  const signal = useMemo(() => createSignal(router.path), []);
  useEffect(() => {
    signal.set(router.path);
  }, [router.path, signal]);
  return signal;
}
