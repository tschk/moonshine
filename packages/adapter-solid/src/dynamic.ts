import { h } from "./component-factory";
/** Native dynamic components; not Solid's compiled web instruction ABI. */
import { eventRegistration, type DOMChild } from "@tschk/moonshine-dom/dom";
import {
  createMemo,
  getOwner,
  createRenderEffect,
  onCleanup,
  untrack,
  type Accessor,
} from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { splitProps } from "./props";
import { registerSolidEvent } from "./events";

export type DynamicComponent<R = DOMChild> = string | ((props: any) => R);
export type DynamicProps<T> = T extends (props: infer P) => unknown
  ? P
  : Record<string, unknown>;

function intrinsicProps(props: object): Record<string, unknown> {
  return new Proxy(
    {},
    {
      ownKeys: () => Reflect.ownKeys(props),
      has: (_, key) => Reflect.has(props, key),
      getOwnPropertyDescriptor: (_, key) =>
        Reflect.has(props, key)
          ? {
              configurable: true,
              enumerable:
                Reflect.getOwnPropertyDescriptor(props, key)?.enumerable ??
                true,
            }
          : undefined,
      get: (_, key) => {
        if (key === eventRegistration)
          return (element: Element, name: string, read: () => unknown) => {
            const listener = createMemo(read);
            let dispose: ReturnType<typeof registerSolidEvent> | undefined;
            onCleanup(() => dispose?.());
            createRenderEffect(() => {
              const value = listener();
              if (dispose?.update?.(value)) return;
              const previous = dispose;
              dispose = undefined;
              previous?.();
              dispose = registerSolidEvent(element, name, value);
            });
            return () => {};
          };
        if (key === "ref" || key === "xmlns")
          return Reflect.get(props, key, props);
        return () => Reflect.get(props, key, props);
      },
    },
  );
}

export function createDynamic<T extends DynamicComponent>(
  component: () => T | undefined,
  props: DynamicProps<NoInfer<T>>,
): Accessor<DOMChild | undefined> {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr")
    throw new Error(
      "Server dynamic components require the explicit /ssr entry",
    );
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error(
      "Dynamic component invocation requires a live native owner",
    );
  const selected = createMemo(component);
  return createMemo(() => {
    const value = selected();
    if (typeof value === "function")
      return untrack(() => h(value, props as Record<string, unknown>));
    if (typeof value === "string")
      return untrack(() => h(value, intrinsicProps(props as object)));
    return undefined;
  });
}

export function Dynamic<T extends DynamicComponent>(
  props: { component: T | undefined } & DynamicProps<NoInfer<T>>,
): Accessor<DOMChild | undefined> {
  const [, rest] = splitProps(props, ["component"]);
  return createDynamic(() => props.component, rest as DynamicProps<T>);
}
