import {
  h as nativeH,
  eventRegistration,
  type DOMChild,
} from "@tschk/moonshine-dom/dom";
import { registerSolidEvent } from "./events";
const eventProps: ProxyHandler<object> = {
  get(target, key) {
    return key === eventRegistration
      ? registerSolidEvent
      : Reflect.get(target, key, target);
  },
};
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): HTMLElementTagNameMap[K];
export function h<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): SVGElementTagNameMap[K];
export function h<P extends object>(
  component: (props: P & { children?: DOMChild }) => DOMChild,
  props: P | null,
  ...children: DOMChild[]
): DOMChild;
export function h(
  tag: string,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): HTMLElement | SVGElement;
export function h<P extends Record<string, unknown>>(
  tag: string | ((props: P & { children?: DOMChild }) => DOMChild),
  props: P | null = null,
  ...children: DOMChild[]
): DOMChild {
  if (typeof tag === "string")
    return nativeH(tag, new Proxy(props ?? {}, eventProps), ...children);
  return nativeH(tag, props, ...children);
}
