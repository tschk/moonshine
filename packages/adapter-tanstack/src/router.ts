"use client";

/**
 * @tanstack/react-router library surface + signal bridges.
 */
import { useEffect, useMemo } from "react";
import {
  Link,
  Outlet,
  useNavigate as useTSNavigate,
  useParams as useTSParams,
  useRouterState,
  useSearch as useTSSearch,
} from "@tanstack/react-router";
import { createSignal, type Signal } from "@tschk/moonshine/react";

export {
  Link,
  Outlet,
  useTSNavigate as useNavigate,
  useTSParams as useParams,
  useRouterState,
  useTSSearch as useSearch,
};

/** Pathname signal from TanStack router state. */
export function usePathnameSignal(): Signal<string> {
  const pathname = useRouterState({
    select: (s: { location: { pathname: string } }) => s.location.pathname,
  });
  const signal = useMemo(() => createSignal(pathname as string), []);
  useEffect(() => {
    signal.set(pathname as string);
  }, [pathname, signal]);
  return signal;
}
