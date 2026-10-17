/** Solid function components share their consumer owner; native/foreign components use native h. */
import { h as nativeH, type DOMChild } from "@tschk/moonshine-dom/dom";
import { getOwner, untrack } from "@tschk/moonshine-dom/reactive";
import {
  peekComponentContext,
  withComponentConsumer,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { retainRoot } from "./cleanup-finalization";
export function createComponent<P, T>(fn: (props: P) => T, props: P): T {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw Error("Solid components require a live native owner");
  const frame: ComponentContext<P> = {
    owner,
    props,
    mode: "dom",
    contexts: new Map(peekComponentContext()?.contexts),
    active: false,
  };
  const value = withComponentConsumer(frame, () => untrack(() => fn(props)));
  let first: unknown,
    failed = false;
  for (const ready of frame.ready ?? []) {
    if (owner.disposed) break;
    try {
      ready();
    } catch (error) {
      if (!failed) first = error;
      failed = true;
    }
  }
  if (failed) throw first;
  retainRoot(value);
  return value;
}
export const h: typeof nativeH = ((
  tag: string | ((props: any) => DOMChild),
  props: any = null,
  ...children: DOMChild[]
) => {
  if (typeof tag !== "function") {
    const node = nativeH(tag, props, ...children);
    retainRoot(node);
    return node;
  }
  const next = children.length
    ? Object.defineProperties(
        {},
        {
          ...Object.getOwnPropertyDescriptors(props ?? {}),
          children: {
            value: children,
            enumerable: true,
            writable: true,
            configurable: true,
          },
        },
      )
    : (props ?? {});
  return createComponent(tag, next);
}) as typeof nativeH;
