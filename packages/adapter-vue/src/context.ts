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
