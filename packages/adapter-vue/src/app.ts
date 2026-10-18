import { createComponent } from "@tschk/moonshine-dom/component";
import { flushComponentReferences } from "@tschk/moonshine-dom/component-instance";
import { render, type DOMChild } from "@tschk/moonshine-dom/dom";
export type { ShallowUnwrap } from "./expose";

/** Erased return metadata supplied only by the native SFC compiler. */
declare const componentMetadata: unique symbol;
export type ComponentView<
  View,
  Exports extends object,
  Props extends object = object,
> = View & {
  readonly [componentMetadata]?: { props: Props; exports: Exports };
};
type Metadata<R> = [R] extends [never]
  ? never
  : typeof componentMetadata extends keyof NonNullable<R>
    ? NonNullable<NonNullable<R>[typeof componentMetadata]>
    : never;
export type ComponentProps<C extends (...args: never[]) => unknown> = [
  Metadata<ReturnType<C>>,
] extends [never]
  ? never
  : Metadata<ReturnType<C>> extends { props: infer P extends object }
    ? P
    : never;
export type ComponentExports<C extends (...args: never[]) => unknown> = [
  Metadata<ReturnType<C>>,
] extends [never]
  ? never
  : Metadata<ReturnType<C>> extends { exports: infer E extends object }
    ? E
    : never;
type ExportsOf<R> = [Metadata<R>] extends [never]
  ? object
  : Metadata<R> extends { exports: infer E extends object }
    ? E
    : object;

export interface NativeApplication<out E extends object = object> {
  mount(target: string | Element | ShadowRoot): E;
  unmount(): void;
}

const emptyInstance: object = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ Object.create(null),
);
const leases = /* @__PURE__ */ new WeakMap<
  Element | ShadowRoot,
  NativeApplication
>();

// Validate async/VNode results without evaluating accessor children ahead of insert.
function content(value: DOMChild): DOMChild {
  if (typeof value === "function") return () => content(value());
  if (Array.isArray(value)) return value.map(content);
  if (value !== null && typeof value === "object" && !(value instanceof Node)) {
    if (value instanceof Promise)
      void Promise.prototype.then.call(value, undefined, () => {});
    throw new TypeError(
      "Native applications require DOM children, not promises or VNodes",
    );
  }
  return value;
}

/** Mount a native compiled/component factory; this does not execute Vue VNodes. */
export function createApp<P extends object, R extends DOMChild = DOMChild>(
  component: (props: P) => R,
  props: P,
): NativeApplication<ExportsOf<R>> {
  if (typeof component !== "function")
    throw new TypeError("Native applications require a component factory");
  if (props === null || typeof props !== "object" || Array.isArray(props))
    throw new TypeError("Native application props must be an object");
  let state: "new" | "mounting" | "mounted" | "stopped" = "new";
  let stop: (() => void) | undefined;
  const stopped = () => state === "stopped";
  const unmount = () => {
    if (state === "new" || state === "stopped") return;
    state = "stopped";
    const dispose = stop;
    stop = undefined;
    dispose?.();
  };
  const app: NativeApplication<ExportsOf<R>> = {
    mount(target) {
      if (state !== "new")
        throw new Error("Native application cannot be mounted again");
      if (typeof document === "undefined")
        throw new Error("Native application mount requires a DOM");
      const container =
        typeof target === "string" ? document.querySelector(target) : target;
      if (!(container instanceof Element) && !(container instanceof ShadowRoot))
        throw new TypeError(
          "Native application mount target was not found or is invalid",
        );
      if (leases.has(container))
        throw new Error("Native application mount target is already owned");
      const release = () => {
        if (leases.get(container) === app) leases.delete(container);
      };
      // Clearing and disposal can synchronously reenter another app mount.
      leases.set(container, app);
      state = "mounting";
      let instance: object | undefined;
      try {
        container.replaceChildren();
        if (stopped()) {
          release();
          return emptyInstance as ExportsOf<R>;
        }
        const dispose = render(
          () =>
            createComponent(
              (input: P) => content(component(input)),
              props,
              "dom",
              {
                capture: (value) => {
                  instance = value;
                },
              },
            ),
          container,
        );
        const finish = () => {
          try {
            dispose();
          } finally {
            release();
          }
        };
        if (stopped()) finish();
        else {
          flushComponentReferences();
          stop = finish;
          state = "mounted";
        }
        return (instance ?? emptyInstance) as ExportsOf<R>;
      } catch (error) {
        release();
        state = "stopped";
        throw error;
      }
    },
    unmount,
  };
  return app;
}
