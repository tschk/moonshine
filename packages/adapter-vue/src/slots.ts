/** Compiler-private static default-slot transport; independent of declared props. */
import {
  getComponentContext,
  withComponentConsumer,
} from "@tschk/moonshine-dom/component";
import {
  createComponentScope,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import type { DOMChild } from "@tschk/moonshine-dom";
import type { SSRChild } from "@tschk/moonshine-dom/ssr";
const slots = /* @__PURE__ */ Symbol("moonshine.vue.slots");
type Content = () => unknown;
/** Each authored outlet gets a distinct instance; its factory identity is static. */
function createSlotOutlet(
  source: object,
  persistentDOM: boolean,
): (fallback?: Content) => unknown {
  const consumer = getComponentContext();
  const supplied = Reflect.get(source, slots, source) as Content | undefined;
  if (supplied !== undefined && typeof supplied !== "function")
    throw new TypeError("Slot content must be a factory");
  let initialized = false,
    result: unknown;
  return (fallback) => {
    if (consumer.owner.disposed) return undefined;
    if (!initialized) {
      const invoke = () =>
        withComponentConsumer(consumer, () =>
          untrack(() => (supplied ? supplied() : fallback?.())),
        );
      // Static DOM content outlives transient insert reads; SSR must retain its current attempt.
      result = persistentDOM
        ? runWithOwner(consumer.owner, () => createComponentScope(invoke))
        : invoke();
      if (consumer.owner.disposed) return undefined;
      initialized = true;
    }
    return result;
  };
}

export function createDOMSlotOutlet(
  source: object,
): (fallback?: () => DOMChild) => DOMChild {
  return createSlotOutlet(source, true) as (
    fallback?: () => DOMChild,
  ) => DOMChild;
}
export function createServerSlotOutlet(
  source: object,
): (fallback?: () => SSRChild) => SSRChild {
  return createSlotOutlet(source, false) as (
    fallback?: () => SSRChild,
  ) => SSRChild;
}
/** Compiler-private wrapper: native h creates its one consumer scope around this function. */
export function withDefaultSlot<P extends object, R>(
  component: (props: P) => R,
  content: Content,
): (props: P) => R {
  if (typeof component !== "function" || typeof content !== "function")
    throw new TypeError("Static component and slot factories required");
  return (source) => {
    const target = Object.create(
      Object.getPrototypeOf(source),
      Object.getOwnPropertyDescriptors(source),
    );
    Object.defineProperty(target, slots, {
      value: content,
      enumerable: true,
      configurable: true,
    });
    const view = new Proxy(target, {
      get(_target, key) {
        return key === slots ? content : Reflect.get(source, key, source);
      },
    }) as P;
    return component(view);
  };
}
