/** Independent Svelte 5 `svelte/legacy` migration helpers using Moonshine's native runtime. */
import {
  componentEvents,
  peekComponentContext,
} from "@tschk/moonshine-dom/component";
import {
  createComputed,
  getOwner,
  getRenderScheduler,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { mount, unmount } from "./mount";
import { createRunePreEffect } from "./pre";
import { createState } from "./runes";
import { createEventDispatcher, flushSync } from "./svelte";

/**
 * Runs a function inside a pre-effect (replacing Svelte 4 `$: { ... }` statements),
 * or executes it once synchronously during SSR.
 */
export function run(fn: () => void | (() => void)): void {
  if (typeof fn !== "function") {
    throw new TypeError("svelte/legacy run() requires a callback function");
  }
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") {
    fn();
    return;
  }
  if (getRenderScheduler()) {
    createRunePreEffect(fn);
    return;
  }
  if (getOwner()) {
    let cleanup: (() => void) | void;
    createComputed(() => {
      if (typeof cleanup === "function") {
        untrack(cleanup);
        cleanup = undefined;
      }
      cleanup = fn();
    });
    onCleanup(() => {
      if (typeof cleanup === "function") {
        untrack(cleanup);
        cleanup = undefined;
      }
    });
    return;
  }
  fn();
}

export type LegacyEventHandler<E extends Event = Event, T = any> =
  ((this: T, event: E) => void) | null | undefined;

/** Composes multiple event handlers in order, preserving the `this` receiver. */
export function handlers<E extends Event = Event, T = any>(
  ...fns: Array<LegacyEventHandler<E, T>>
): (this: T, event: E) => void {
  return function (this: T, event: E) {
    for (const fn of fns) {
      if (typeof fn === "function") {
        Reflect.apply(fn, this, [event]);
      }
    }
  };
}

/** Wraps an event handler so it is invoked at most once. */
export function once<E extends Event = Event, T = any>(
  fn: LegacyEventHandler<E, T>,
): (this: T, event: E) => void {
  let ran = false;
  return function (this: T, event: E) {
    if (ran) return;
    ran = true;
    if (typeof fn === "function") {
      Reflect.apply(fn, this, [event]);
    }
  };
}

/** Calls `event.preventDefault()` before running `fn`. */
export function preventDefault<E extends Event = Event, T = any>(
  fn: LegacyEventHandler<E, T>,
): (this: T, event: E) => void {
  return function (this: T, event: E) {
    event.preventDefault();
    if (typeof fn === "function") {
      Reflect.apply(fn, this, [event]);
    }
  };
}

/** Calls `event.stopPropagation()` before running `fn`. */
export function stopPropagation<E extends Event = Event, T = any>(
  fn: LegacyEventHandler<E, T>,
): (this: T, event: E) => void {
  return function (this: T, event: E) {
    event.stopPropagation();
    if (typeof fn === "function") {
      Reflect.apply(fn, this, [event]);
    }
  };
}

/** Calls `event.stopImmediatePropagation()` before running `fn`. */
export function stopImmediatePropagation<E extends Event = Event, T = any>(
  fn: LegacyEventHandler<E, T>,
): (this: T, event: E) => void {
  return function (this: T, event: E) {
    event.stopImmediatePropagation();
    if (typeof fn === "function") {
      Reflect.apply(fn, this, [event]);
    }
  };
}

/** Invokes `fn` only when `event.target === event.currentTarget`. */
export function self<E extends Event = Event, T = any>(
  fn: LegacyEventHandler<E, T>,
): (this: T, event: E) => void {
  return function (this: T, event: E) {
    if (event.target === event.currentTarget && typeof fn === "function") {
      Reflect.apply(fn, this, [event]);
    }
  };
}

/** Invokes `fn` only when `event.isTrusted === true`. */
export function trusted<E extends Event = Event, T = any>(
  fn: LegacyEventHandler<E, T>,
): (this: T, event: E) => void {
  return function (this: T, event: E) {
    if (event.isTrusted && typeof fn === "function") {
      Reflect.apply(fn, this, [event]);
    }
  };
}

export type PassiveActionParams = [
  event: string,
  handler:
    (() => EventListener | null | undefined) | EventListener | null | undefined,
];

function listenWithPassiveFlag(
  node: EventTarget,
  initialParams: PassiveActionParams,
  passiveFlag: boolean,
): { update(nextParams: PassiveActionParams): void; destroy(): void } {
  let currentEvent = initialParams[0];
  let currentHandler = initialParams[1];
  const listener: EventListener = function (this: any, e: Event) {
    if (typeof currentHandler === "function") {
      const result = Reflect.apply(currentHandler, this, [e]);
      if (typeof result === "function") {
        Reflect.apply(result, this, [e]);
      }
    }
  };
  node.addEventListener(currentEvent, listener, { passive: passiveFlag });
  return {
    update(nextParams: PassiveActionParams) {
      const [nextEvent, nextHandler] = nextParams;
      if (nextEvent !== currentEvent) {
        node.removeEventListener(currentEvent, listener);
        currentEvent = nextEvent;
        node.addEventListener(currentEvent, listener, { passive: passiveFlag });
      }
      currentHandler = nextHandler;
    },
    destroy() {
      node.removeEventListener(currentEvent, listener);
    },
  };
}

/** Action attaching an event listener with `{ passive: true }`. */
export function passive(
  node: EventTarget,
  params: PassiveActionParams,
): { update(nextParams: PassiveActionParams): void; destroy(): void } {
  return listenWithPassiveFlag(node, params, true);
}

/** Action attaching an event listener with `{ passive: false }`. */
export function nonpassive(
  node: EventTarget,
  params: PassiveActionParams,
): { update(nextParams: PassiveActionParams): void; destroy(): void } {
  return listenWithPassiveFlag(node, params, false);
}

/** Creates an event bubbler function `bubble(type)` for forwarding DOM/component events. */
export function createBubbler(): (type: string) => (event: Event) => boolean {
  const hasComponent = Boolean(peekComponentContext()?.active);
  const dispatch = hasComponent ? createEventDispatcher() : undefined;
  return (type: string) => (event: Event) => {
    if (!dispatch) {
      if (
        event &&
        event.currentTarget &&
        typeof (event.currentTarget as EventTarget).dispatchEvent === "function"
      ) {
        return true;
      }
      return true;
    }
    const detail = event instanceof CustomEvent ? event.detail : undefined;
    return dispatch(type, detail, { cancelable: event.cancelable });
  };
}

export interface LegacyComponentConstructorOptions<
  Props extends Record<string, any> = Record<string, any>,
> {
  target: Element | ShadowRoot;
  anchor?: Node;
  props?: Props;
  context?: Map<any, any>;
  intro?: boolean;
}

export interface LegacySvelteComponentInstance<
  Props extends Record<string, any> = Record<string, any>,
> {
  $set(props: Partial<Props>): void;
  $on(type: string, callback: (event: CustomEvent<any>) => void): () => void;
  $destroy(): void;
}

/**
 * Imperatively instantiates a Svelte 5 component with a Svelte 4 class instance API
 * (`$set`, `$on`, `$destroy`).
 */
export function createClassComponent<
  Props extends Record<string, any> = Record<string, any>,
  Exports extends Record<string, any> = Record<string, any>,
>(
  options: LegacyComponentConstructorOptions<Props> & {
    component: (props: Props) => any;
  },
): Exports & LegacySvelteComponentInstance<Props> {
  const {
    component,
    target,
    anchor,
    props: initialProps,
    context,
    intro,
  } = options;
  const listeners = new Map<string, Set<(event: CustomEvent<any>) => void>>();
  const eventsRecord: Record<
    string,
    Array<(event: CustomEvent<any>) => void>
  > = {};

  const syncEventListeners = (type: string) => {
    const set = listeners.get(type);
    eventsRecord[type] = set ? [...set] : [];
  };

  const reactiveProps = createState<Record<string, any>>({
    ...initialProps,
  }).value;

  const proxyProps = new Proxy(reactiveProps, {
    get(obj, key) {
      if (key === componentEvents) return eventsRecord;
      return Reflect.get(obj, key, obj);
    },
    has(obj, key) {
      if (key === componentEvents) return true;
      return Reflect.has(obj, key);
    },
  }) as Props;

  const mountedExports = mount(component as any, {
    target,
    anchor,
    props: proxyProps as never,
    context,
    intro,
  }) as Record<string, any>;

  const api: LegacySvelteComponentInstance<Props> = {
    $set(nextProps: Partial<Props>) {
      flushSync(() => {
        for (const [key, value] of Object.entries(nextProps)) {
          reactiveProps[key] = value;
        }
      });
    },
    $on(type: string, callback: (event: CustomEvent<any>) => void) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(callback);
      syncEventListeners(type);
      return () => {
        set?.delete(callback);
        syncEventListeners(type);
      };
    },
    $destroy() {
      void unmount(mountedExports);
    },
  };

  return new Proxy(api as Exports & LegacySvelteComponentInstance<Props>, {
    get(targetObj, prop, receiver) {
      if (prop in targetObj) {
        return Reflect.get(targetObj, prop, receiver);
      }
      return Reflect.get(mountedExports, prop, mountedExports);
    },
    set(targetObj, prop, value, receiver) {
      if (prop in targetObj) {
        return Reflect.set(targetObj, prop, value, receiver);
      }
      flushSync(() => {
        reactiveProps[String(prop)] = value;
      });
      return true;
    },
    has(targetObj, prop) {
      return prop in targetObj || prop in mountedExports;
    },
  });
}

/**
 * Wraps a Svelte 5 functional component into a Svelte 4 class constructor
 * supporting `new Comp({ target, props })`, `$set`, `$on`, and `$destroy`.
 */
export function asClassComponent<
  Props extends Record<string, any> = Record<string, any>,
  Exports extends Record<string, any> = Record<string, any>,
>(
  component: (props: Props) => any,
): new (
  options: LegacyComponentConstructorOptions<Props>,
) => Exports & LegacySvelteComponentInstance<Props> {
  function LegacyComponentWrapper(
    this: unknown,
    options: LegacyComponentConstructorOptions<Props>,
  ) {
    return createClassComponent<Props, Exports>({
      ...options,
      component,
    });
  }
  return LegacyComponentWrapper as unknown as new (
    options: LegacyComponentConstructorOptions<Props>,
  ) => Exports & LegacySvelteComponentInstance<Props>;
}
