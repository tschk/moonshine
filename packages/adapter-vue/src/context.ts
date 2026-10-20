/** Native component injection and application/SSR context primitives. */
import {
  getComponentContext,
  peekComponentContext,
  setContext,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { getOwner, untrack, type Owner } from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";

declare const injectionType: unique symbol;
export type InjectionKey<T> = symbol & { readonly [injectionType]?: T };
const providesKey = Symbol("moonshine.vue.provides");
export const appContextKey = Symbol("moonshine.vue.app-context");
const idCounters = /* @__PURE__ */ new WeakMap<Owner, { next: number }>();
const ssrContexts = /* @__PURE__ */ new WeakMap<Owner, Record<string, any>>();

export interface AppConfig {
  errorHandler?: (
    err: unknown,
    instance: ComponentContext | undefined,
    info: string,
  ) => void;
  warnHandler?: (
    msg: string,
    instance: ComponentContext | undefined,
    trace: string,
  ) => void;
  globalProperties: Record<string, any>;
  performance: boolean;
  idPrefix?: string;
  compilerOptions: Record<string, any>;
  optionMergeStrategies: Record<string, (parent: any, child: any) => any>;
  throwUnhandledErrorInProduction?: boolean;
}

export interface AppContextState {
  provides: Map<PropertyKey, unknown>;
  components: Map<string, (...args: any[]) => any>;
  directives: Map<string, any>;
  mixins: Array<Record<string, any>>;
  config: AppConfig;
  idState: { next: number };
}

let activeAppContext: AppContextState | undefined;
let activeSSRContext: Record<string, any> | undefined;

export function withActiveAppContext<T>(ctx: AppContextState, fn: () => T): T {
  const prev = activeAppContext;
  activeAppContext = ctx;
  try {
    return fn();
  } finally {
    activeAppContext = prev;
  }
}

export function peekAppContext(): AppContextState | undefined {
  if (activeAppContext) return activeAppContext;
  const ownerCtx = getOwner()?.context?.get(appContextKey) as
    AppContextState | undefined;
  if (ownerCtx) return ownerCtx;
  const frameCtx = peekComponentContext()?.owner.context?.get(appContextKey) as
    AppContextState | undefined;
  return frameCtx;
}

export type SSRContext = Record<string, any>;

export function withSSRContext<T>(ctx: SSRContext | undefined, fn: () => T): T {
  const prev = activeSSRContext;
  activeSSRContext = ctx;
  try {
    return fn();
  } finally {
    activeSSRContext = prev;
  }
}

export async function withSSRContextAsync<T>(
  ctx: SSRContext | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = activeSSRContext;
  activeSSRContext = ctx;
  try {
    return await fn();
  } finally {
    activeSSRContext = prev;
  }
}

export function peekSSRContext<T extends SSRContext = SSRContext>():
  T | undefined {
  return activeSSRContext as T | undefined;
}

export function useSSRContext<T extends SSRContext = SSRContext>():
  T | undefined {
  const frame = peekComponentContext();
  if (frame?.mode === "dom") return undefined;
  if (activeSSRContext) return activeSSRContext as T;
  if (frame?.mode === "ssr" || isSSRRendering()) {
    const owner = frame?.owner ?? getOwner();
    if (owner) {
      let root: Owner = owner;
      while (root.parent) root = root.parent;
      let ctx = ssrContexts.get(root);
      if (!ctx) {
        ctx = {};
        ssrContexts.set(root, ctx);
      }
      return ctx as T;
    }
    return {} as T;
  }
  return undefined;
}

type Provides = {
  frame: ComponentContext;
  parent?: Provides;
  values: Map<PropertyKey, unknown>;
};
function layer(frame: ComponentContext): Provides | undefined {
  return frame.contexts.get(providesKey) as Provides | undefined;
}
export function provide<T>(
  key: InjectionKey<T> | string | number,
  value: T,
): void {
  const frame = getComponentContext();
  let current = layer(frame);
  if (current?.frame !== frame) {
    current = { frame, parent: current, values: new Map() };
    setContext(providesKey, current);
  }
  current.values.set(key, value);
}
export function inject<T>(key: InjectionKey<T> | string): T | undefined;
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T,
  treatDefaultAsFactory?: false,
): T;
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: () => T,
  treatDefaultAsFactory: true,
): T;
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue?: T | (() => T),
  treatDefaultAsFactory = false,
): T | undefined {
  const frame = peekComponentContext();
  if (frame?.active && !frame.owner.disposed) {
    let current = layer(frame);
    if (current?.frame === frame) current = current.parent;
    for (; current; current = current.parent) {
      if (current.values.has(key)) return current.values.get(key) as T;
    }
    const appCtx = peekAppContext();
    if (appCtx?.provides.has(key)) {
      return appCtx.provides.get(key) as T;
    }
    return treatDefaultAsFactory && typeof defaultValue === "function"
      ? untrack(() => (defaultValue as () => T)())
      : (defaultValue as T | undefined);
  }
  if (activeAppContext) {
    if (activeAppContext.provides.has(key)) {
      return activeAppContext.provides.get(key) as T;
    }
    return treatDefaultAsFactory && typeof defaultValue === "function"
      ? untrack(() => (defaultValue as () => T)())
      : (defaultValue as T | undefined);
  }
  getComponentContext();
  return undefined;
}
export function hasInjectionContext(): boolean {
  const frame = peekComponentContext();
  return (
    (!!frame?.active && !frame.owner.disposed) || Boolean(activeAppContext)
  );
}
import { getDefaultSlotFactory } from "./slots";

export function useId(): string {
  const frame = peekComponentContext();
  if (!frame?.active && activeAppContext) {
    const prefix = activeAppContext.config.idPrefix || "v";
    return `${prefix}-${activeAppContext.idState.next++}`;
  }
  const activeFrame = getComponentContext();
  const appCtx = peekAppContext();
  const prefix = appCtx?.config.idPrefix || "v";
  let root: Owner = activeFrame.owner;
  while (root.parent) root = root.parent;
  let state = idCounters.get(root);
  if (!state) {
    state = { next: 0 };
    idCounters.set(root, state);
  }
  return `${prefix}-${state.next++}`;
}

export function useAttrs(): Record<string, unknown> {
  const frame = getComponentContext();
  const raw =
    frame.props !== null &&
    typeof frame.props === "object" &&
    !Array.isArray(frame.props)
      ? (frame.props as Record<string, unknown>)
      : {};
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "$slots" || prop === "slots") return undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === "symbol" || prop === "$slots" || prop === "slots") {
        return false;
      }
      return prop in target;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter(
        (key): key is string =>
          typeof key === "string" && key !== "$slots" && key !== "slots",
      );
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "symbol" || prop === "$slots" || prop === "slots") {
        return undefined;
      }
      const desc = Reflect.getOwnPropertyDescriptor(target, prop);
      if (desc) return { ...desc, configurable: true };
      return undefined;
    },
  });
}

export type Slots = Readonly<
  Record<string, ((...args: any[]) => unknown) | undefined>
>;

export function useSlots<T extends Record<string, any> = Slots>(): T {
  const frame = getComponentContext();
  const raw =
    frame.props !== null &&
    typeof frame.props === "object" &&
    !Array.isArray(frame.props)
      ? (frame.props as Record<string, unknown>)
      : {};
  const defaultSlot = getDefaultSlotFactory(raw, frame);
  const explicitSlots =
    (raw.$slots && typeof raw.$slots === "object"
      ? (raw.$slots as Record<string, (...args: any[]) => unknown>)
      : undefined) ??
    (raw.slots && typeof raw.slots === "object"
      ? (raw.slots as Record<string, (...args: any[]) => unknown>)
      : undefined);

  const out: Record<string, ((...args: any[]) => unknown) | undefined> = {
    ...explicitSlots,
  };
  if (defaultSlot && !out.default) {
    out.default = defaultSlot;
  } else if (typeof raw.children === "function" && !out.default) {
    out.default = raw.children as (...args: any[]) => unknown;
  }
  return Object.freeze(out) as unknown as T;
}
