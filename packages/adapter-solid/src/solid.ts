/** Native source-level helpers; Solid compiler instructions are not supported. */
import {
  mapArray as nativeMapArray,
  indexArray as nativeIndexArray,
} from "@tschk/moonshine-dom/control";
import type { Accessor } from "@tschk/moonshine-dom/reactive";

export {
  catchError,
  batch,
  createEffect,
  createComputed,
  createRenderEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  untrack,
} from "@tschk/moonshine-dom/reactive";
export type { Accessor, Setter } from "@tschk/moonshine-dom/reactive";
export { nativeMapArray as mapArray, nativeIndexArray as indexArray };
export {
  DEV,
  Suspense,
  SuspenseList,
  createUniqueId,
  createSelector,
  createReaction,
  createDeferred,
  enableExternalSource,
  getExternalSourceFactories,
  resetErrorBoundaries,
  startTransition,
  useTransition,
  observable,
  from,
  type DeferredOptions,
  type ExternalSource,
  type ExternalSourceFactory,
  type SuspenseListProps,
  type SuspenseProps,
  type Transition,
  type EqualityCheckerFunction,
  type Observable,
  type ObservableObserver,
} from "./primitives";
export { createResource } from "@tschk/moonshine-dom/resource";
export type { Resource } from "@tschk/moonshine-dom/resource";

type ListProps<T, F> = {
  readonly each: readonly T[] | false | null | undefined;
  readonly fallback?: F;
};

export function For<T, U, F = U>(
  props: ListProps<T, F> & {
    children: (item: T, index: Accessor<number>) => U;
  },
): Accessor<U[] | F | undefined> {
  const child = props.children;
  const map =
    child.length > 1 ? child : (item: T) => (child as (item: T) => U)(item);
  const items = () => props.each || [];
  return nativeMapArray(
    items,
    map,
    undefined,
    undefined,
    "before-map",
    "fallback" in props ? () => props.fallback : undefined,
  );
}

export function Index<T, U, F = U>(
  props: ListProps<T, F> & {
    children: (item: Accessor<T>, index: number) => U;
  },
): Accessor<U[] | F | undefined> {
  const child = props.children;
  const items = () => props.each || [];
  return nativeIndexArray(
    items,
    child,
    undefined,
    "before-map",
    "fallback" in props ? () => props.fallback : undefined,
  );
}

export {
  Show,
  Switch,
  Match,
  ErrorBoundary,
  type ConditionalProps,
  type SwitchChild,
} from "./flow";
export { createContext, useContext, type Context } from "./context";
export { children, type ResolvedChildren, type ChildValue } from "./children";
export { mergeProps, splitProps } from "./props";
export { lazy } from "./lazy";
export { createRoot } from "./cleanup-policy";
export { getOwner, runWithOwner } from "./owner";
export type { Owner } from "./owner";
