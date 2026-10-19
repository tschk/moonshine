import { rawSSRRegistrar, type Registrar } from "./raw-ssr-lifecycle";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  captureSSRRenderAttempt,
  isSSRRenderAccepted,
} from "@tschk/moonshine-dom/ssr-attempt";
import {
  componentEvents,
  getComponentContext,
  peekComponentContext,
  getContext as nativeGetContext,
  setContext as nativeSetContext,
  hasContext as nativeHasContext,
} from "@tschk/moonshine-dom/component";
import { createRuneEffect } from "./effect";
import { drainTickWork, hasPendingTickWork } from "./tick-queue";
import { withHistoryCleanup } from "./history";

/** Source snippet parameters; compiled render cells are private to Crepus. */
export type Snippet<Parameters extends unknown[] = []> = (
  ...args: number extends Parameters["length"] ? never : Parameters
) => unknown;

/** Native owner lifecycle helpers; Svelte compiler output is not supported. */
import {
  assertNotCleanupComputation,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
export { untrack };
export { getAbortSignal } from "./abort-signal";

function componentOwner(hook: string) {
  assertNotCleanupComputation();
  const owner = getOwner();
  const frame = peekComponentContext();
  if (!owner || owner.disposed || (frame && !frame.active))
    throw new Error(
      `${hook} must be called during native component initialization`,
    );
  return owner;
}

export function onMount(fn: () => unknown): void {
  componentOwner("onMount");
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return;
  createRuneEffect(() => {
    const cleanup = untrack(fn);
    if (typeof cleanup === "function") return cleanup as () => void;
  });
}

export function onDestroy(fn: () => void): void {
  const owner = componentOwner("onDestroy");
  const server = isSSRRendering() || peekComponentContext()?.mode === "ssr";
  const registrar = getOwner()?.context?.get(rawSSRRegistrar) as
    Registrar | undefined;
  if (server && registrar && registrar.consumer === peekComponentContext()) {
    registrar.register(fn);
    return;
  }
  const attempt = server ? captureSSRRenderAttempt() : undefined;
  const cleanup = server
    ? () => {
        if (isSSRRenderAccepted(attempt)) fn();
      }
    : () => runWithOwner(owner, () => withHistoryCleanup(fn));
  // Server hooks belong to the authored component, not compiler memo scopes.
  const consumer = server ? peekComponentContext()?.owner : undefined;
  runWithOwner(consumer ?? owner, () => onCleanup(cleanup));
}

/** Commit pending native rune work; future promise/timer updates are separate. */
export async function tick(): Promise<void> {
  await Promise.resolve();
  drainTickWork();
}

/** Synchronously run an optional callback and drain queued native rune work. */
export function flushSync<T = void>(fn?: () => T): T {
  if (fn !== undefined && typeof fn !== "function") {
    throw new TypeError("flushSync callback must be a function");
  }
  const result = fn ? fn() : (undefined as T);
  drainTickWork();
  return result;
}

/** Wait until all queued native rune work (including chained effect ticks) settles. */
export async function settled(): Promise<void> {
  await Promise.resolve();
  drainTickWork();
  while (hasPendingTickWork()) {
    await Promise.resolve();
    drainTickWork();
  }
}

export type EventDispatcher<EventMap extends Record<string, any>> = <
  Type extends keyof EventMap,
>(
  type: Type,
  ...args: undefined extends EventMap[Type]
    ? [detail?: EventMap[Type], options?: { cancelable?: boolean }]
    : null extends EventMap[Type]
      ? [detail?: EventMap[Type], options?: { cancelable?: boolean }]
      : [detail: EventMap[Type], options?: { cancelable?: boolean }]
) => boolean;

export function createEventDispatcher<
  EventMap extends Record<string, any> = any,
>(): EventDispatcher<EventMap> {
  const frame = getComponentContext();
  return ((
    type: string,
    detail?: unknown,
    options?: { cancelable?: boolean },
  ) => {
    if (frame.owner.disposed) return true;
    return untrack(() => {
      const props = frame.props;
      if (!props || (typeof props !== "object" && typeof props !== "function"))
        return true;
      const events = Reflect.get(props, componentEvents);
      if (!events || !Object.hasOwn(events, type)) return true;
      const listeners = events[type];
      if (listeners == null) return true;
      const callbacks = Array.isArray(listeners)
        ? listeners.slice()
        : [listeners];
      if (!callbacks.every((listener) => typeof listener === "function"))
        throw new TypeError("Component event listeners must be functions");
      const event = new CustomEvent(type, {
        detail,
        cancelable: options?.cancelable ?? false,
        bubbles: false,
      });
      // Native function components have no legacy exported-instance `this`.
      for (const callback of callbacks)
        Reflect.apply(callback, undefined, [event]);
      return !event.defaultPrevented;
    });
  }) as EventDispatcher<EventMap>;
}

export function getContext<T>(key: unknown): T {
  return nativeGetContext<T>(key) as T;
}
export function setContext<T>(key: unknown, value: T): T {
  return nativeSetContext(key, value);
}
export function hasContext(key: unknown): boolean {
  return nativeHasContext(key);
}
/** The live per-instance map, including inherited entries. */
export function getAllContexts<T extends Map<any, any> = Map<any, any>>(): T {
  return getComponentContext().contexts as T;
}
export function createContext<T>(): [() => T, (value: T) => T, () => boolean] {
  const key = Symbol("svelte-context");
  return [
    () => {
      if (!hasContext(key))
        throw new Error(
          "Context has not been set in this component or its ancestors",
        );
      return getContext<T>(key);
    },
    (value) => setContext(key, value),
    () => hasContext(key),
  ];
}
