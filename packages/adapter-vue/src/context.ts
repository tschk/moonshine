/** Native component injection; no Vue app or public-instance runtime. */
import {
  getComponentContext,
  peekComponentContext,
  setContext,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { untrack, type Owner } from "@tschk/moonshine-dom/reactive";

declare const injectionType: unique symbol;
export type InjectionKey<T> = symbol & { readonly [injectionType]?: T };
const providesKey = Symbol("moonshine.vue.provides");
const idCounters = /* @__PURE__ */ new WeakMap<Owner, { next: number }>();
type Provides = {
  frame: ComponentContext;
  parent?: Provides;
  values: Map<string | symbol, unknown>;
};
function layer(frame: ComponentContext): Provides | undefined {
  return frame.contexts.get(providesKey) as Provides | undefined;
}
export function provide<T>(key: InjectionKey<T> | string, value: T): void {
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
  const frame = getComponentContext();
  let current = layer(frame);
  if (current?.frame === frame) current = current.parent;
  for (; current; current = current.parent) {
    if (current.values.has(key)) return current.values.get(key) as T;
  }
  return treatDefaultAsFactory && typeof defaultValue === "function"
    ? untrack(() => (defaultValue as () => T)())
    : (defaultValue as T | undefined);
}
export function hasInjectionContext(): boolean {
  const frame = peekComponentContext();
  return !!frame?.active && !frame.owner.disposed;
}
import { getDefaultSlotFactory } from "./slots";

export function useId(): string {
  const frame = getComponentContext();
  let root: Owner = frame.owner;
  while (root.parent) root = root.parent;
  let state = idCounters.get(root);
  if (!state) {
    state = { next: 0 };
    idCounters.set(root, state);
  }
  return `v-${state.next++}`;
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

export function useSlots(): Slots {
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
  return Object.freeze(out);
}
