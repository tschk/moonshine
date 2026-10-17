import { h, render, type DOMChild } from "@tschk/moonshine-dom/dom";

export interface NativeApplication {
  mount(target: string | Element | ShadowRoot): void;
  unmount(): void;
}

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
export function createApp<P extends object>(
  component: (props: P) => DOMChild,
  props: P,
): NativeApplication {
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
  const app: NativeApplication = {
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
      try {
        container.replaceChildren();
        if (stopped()) {
          release();
          return;
        }
        const dispose = render(
          () => h((input: P) => content(component(input)), props),
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
          stop = finish;
          state = "mounted";
        }
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
