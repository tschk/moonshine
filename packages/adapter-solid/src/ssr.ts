export * from "@tschk/moonshine-dom/ssr";
import { h, type SSRChild } from "@tschk/moonshine-dom/ssr";
import { createIrRenderer } from "./ir";
export type { CrepusNode, CrepusIr, RenderCrepusOptions } from "./ir";
export const { renderCrepusNodeSolid, renderCrepusIrSolid } =
  /* @__PURE__ */ createIrRenderer<SSRChild>(h);

export const isServer: boolean = true;
export const isDev: boolean = false;

export function createComponent<P extends Record<string, unknown>>(
  Comp: (props: P) => SSRChild,
  props: P,
): SSRChild {
  return h(Comp, props);
}

export function generateHydrationScript(_options?: {
  nonce?: string;
  eventNames?: string[];
}): string {
  return "";
}

export function HydrationScript(_props?: {
  nonce?: string;
  eventNames?: string[];
}): undefined {
  return undefined;
}

export function NoHydration<T>(props: { children?: T }): T | undefined {
  return props.children;
}

export function Assets<T>(_props: { children?: T }): undefined {
  return undefined;
}

export function delegateEvents(
  _eventNames: readonly string[],
  _doc?: Document,
): void {}

export function clearDelegatedEvents(_doc?: Document): void {}

/** Portals have no server output and never evaluate their children. */
export function Portal(_props: {
  children?: unknown;
  mount?: unknown;
  isSVG?: boolean;
  useShadow?: boolean;
}): undefined {}

import { splitProps } from "./props";
import type { DynamicComponent, DynamicProps } from "./dynamic";

/** Server selection is evaluated once; no browser runtime is imported. */
export function createDynamic<T extends DynamicComponent<SSRChild>>(
  component: () => T | undefined,
  props: DynamicProps<NoInfer<T>>,
): SSRChild {
  const value = component();
  if (typeof value === "function")
    return h(value, props as Record<string, unknown>);
  if (typeof value !== "string") return undefined;
  const attributes = Object.fromEntries(
    Object.keys(props as object).map((key) => [
      key,
      () => Reflect.get(props as object, key, props),
    ]),
  );
  return h(value, attributes);
}
export function Dynamic<T extends DynamicComponent<SSRChild>>(
  props: { component: T | undefined } & DynamicProps<NoInfer<T>>,
): SSRChild {
  const [, rest] = splitProps(props, ["component"]);
  return createDynamic(() => props.component, rest as DynamicProps<T>);
}

/** Server lists snapshot their length and invoke each row once per request. */
export function For<T, U, F = U>(props: {
  each: readonly T[] | false | null | undefined;
  fallback?: F;
  children: (item: T, index: () => number) => U;
}): U[] | F | undefined {
  const items = props.each || [],
    length = items.length,
    child = props.children;
  return length
    ? Array.from({ length }, (_, index) => child(items[index]!, () => index))
    : props.fallback;
}

export function Index<T, U, F = U>(props: {
  each: readonly T[] | false | null | undefined;
  fallback?: F;
  children: (item: () => T, index: number) => U;
}): U[] | F | undefined {
  const items = props.each || [],
    length = items.length,
    child = props.children;
  return length
    ? Array.from({ length }, (_, index) => {
        const item = items[index]!;
        return child(() => item, index);
      })
    : props.fallback;
}

export { getOwner, runWithOwner } from "./owner";
export type { Owner } from "./owner";

export function createRenderEffect<T>(
  _fn: (previous: T) => T,
  _initial: T,
): void;
export function createRenderEffect(_fn: (previous: undefined) => unknown): void;
export function createRenderEffect<T>(
  _fn: (previous: T) => T,
  _initial?: T,
): void {}

export {
  DEV,
  Suspense,
  SuspenseList,
  createUniqueId,
  createSelector,
  createServerReaction as createReaction,
  createServerDeferred as createDeferred,
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
export { catchError } from "@tschk/moonshine-dom/reactive";
export { mapArray, indexArray } from "@tschk/moonshine-dom/control";

/** Synchronous resource snapshots never invoke the fetcher. */
export { createResource } from "@tschk/moonshine-dom/resource/ssr";
export type {
  ServerResourceActions as ResourceActions,
  ServerResourceReturn as ResourceReturn,
} from "@tschk/moonshine-dom/resource/ssr";
export type {
  Resource,
  ResourceFetcher,
  ResourceOptions,
  ResourceSource,
  ResourceState,
} from "@tschk/moonshine-dom/resource";
