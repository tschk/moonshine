import { createComponent } from "@tschk/moonshine-dom/component";
import {
  createInsertionRange,
  moveInsertionRange,
  render,
  type DOMChild,
} from "@tschk/moonshine-dom/dom";
import { withRuneScheduler } from "./pre";
const mounted = new WeakMap<object, () => void>();
export type {
  ComponentView,
  ComponentFactory,
  ComponentProps,
  ComponentExports,
  MountOptions,
  UnmountOptions,
} from "./mount-types";
import type {
  ComponentExports,
  ComponentProps,
  MountOptions,
  UnmountOptions,
} from "./mount-types";
/** Fresh mount for compiler-marked native SFC factories; hydration is not supported. */
export function mount<C extends (props: never) => DOMChild>(
  component: C & ([ComponentExports<C>] extends [never] ? never : unknown),
  options: MountOptions<ComponentProps<C>>,
): ComponentExports<C> {
  const { target, anchor } = options;
  if (
    typeof Element === "undefined" ||
    (!(target instanceof Element) && !(target instanceof ShadowRoot))
  )
    throw new TypeError(
      "Native mount requires a current-realm Element or ShadowRoot target",
    );
  for (const key of Reflect.ownKeys(options)) {
    if (
      key !== "target" &&
      key !== "anchor" &&
      key !== "props" &&
      key !== "context" &&
      key !== "intro"
    )
      throw new TypeError(`Unsupported native mount option: ${String(key)}`);
  }
  if (options.intro !== undefined && typeof options.intro !== "boolean")
    throw new TypeError("Native mount intro must be boolean");
  if (anchor && anchor.parentNode !== target)
    throw new Error("Mount anchor must belong to target");
  let instance: object | undefined,
    range: Node | undefined,
    stop: (() => void) | undefined;
  try {
    stop = render(
      () =>
        withRuneScheduler(() => {
          range = createInsertionRange(() =>
            createComponent(component, (options.props ?? {}) as never, "dom", {
              contexts: options.context,
              capture: (value) => {
                instance = value;
              },
            }),
          );
          return range;
        }),
      target,
    );
    if (anchor) {
      if (anchor.parentNode !== target)
        throw new Error("Mount anchor must still belong to target after setup");
      moveInsertionRange(range!, anchor);
    }
    if (!instance) throw new Error("Component setup was cancelled");
    mounted.set(instance, stop);
    return instance as ComponentExports<C>;
  } catch (error) {
    try {
      stop?.();
    } catch {}
    throw error;
  }
}
export async function unmount(
  instance: object,
  options?: UnmountOptions,
): Promise<void> {
  for (const key of Reflect.ownKeys(options ?? {})) {
    if (key !== "outro")
      throw new TypeError(`Unsupported native unmount option: ${String(key)}`);
  }
  if (options?.outro !== undefined && options.outro !== false)
    throw new TypeError("Native unmount transitions are unsupported");
  const stop = mounted.get(instance);
  if (stop) {
    mounted.delete(instance);
    stop();
  }
}
