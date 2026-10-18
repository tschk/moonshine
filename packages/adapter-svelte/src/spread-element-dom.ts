import { sourceAttributeValue } from "@tschk/moonshine-dom/attributes";
import {
  createComponentScope,
  createRenderEffect,
  getOwner,
  getRenderScheduler,
  onAfterDispose,
  onCleanup,
  runWithOwner,
  templateRetentionKey,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { classValue } from "./class";
import { withHistoryCleanup } from "./history";

const ATTRIBUTE_NAME = /^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/;
const CONTENT = /* @__PURE__ */ new Set([
  "innerhtml",
  "outerhtml",
  "textcontent",
  "innertext",
]);
const ALIASES: Record<string, string> = {
  formnovalidate: "formNoValidate",
  ismap: "isMap",
  nomodule: "noModule",
  playsinline: "playsInline",
  readonly: "readOnly",
  defaultvalue: "defaultValue",
  defaultchecked: "defaultChecked",
  srcobject: "srcObject",
  novalidate: "noValidate",
  allowfullscreen: "allowFullscreen",
  disablepictureinpicture: "disablePictureInPicture",
  disableremoteplayback: "disableRemotePlayback",
};

type Handler = (this: unknown, event: Event) => unknown;
interface Listener {
  type: string;
  capture: boolean;
  handler: Handler;
  wrapper: (this: unknown, event: Event) => unknown;
}

function install(fn: () => void): void {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return;
  const owner = getOwner(),
    scheduler = getRenderScheduler();
  if (!owner || owner.disposed || !scheduler)
    throw Error("Native directives require a live owner and withRuneScheduler");
  createComponentScope(() => scheduler.branch(fn));
}

function cleanup(fn: () => void): void {
  const finish = () => withHistoryCleanup(() => untrack(fn));
  const owner = getOwner();
  if (owner?.disposed) finish();
  else if (owner?.context?.has(templateRetentionKey))
    onCleanup(() => runWithOwner(owner, finish));
  else onAfterDispose(finish);
}

function setters(element: Element): Set<string> {
  const found = new Set<string>();
  const stop = Element.prototype;
  for (
    let proto: object | null = element;
    proto && proto !== stop;
    proto = Object.getPrototypeOf(proto)
  ) {
    const descriptors = Object.getOwnPropertyDescriptors(proto);
    for (const key of Object.keys(descriptors))
      if (descriptors[key]!.set && !CONTENT.has(key.toLowerCase()))
        found.add(key);
  }
  return found;
}

/** Eager null-prototype merge: every thunk and getter is read exactly once, later layers win. */
function snapshot(layers: readonly unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = Object.create(null);
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const source = typeof layer === "function" ? layer() : layer;
    if (source != null) Object.assign(merged, source);
  }
  return merged;
}

/**
 * Ordinary HTML intrinsic spread for compiler-owned DOM output.
 * Events attach directly (no delegation) with Svelte's case-preserving names and `capture` suffix.
 * Namespaces, forms, custom elements and scoped directives are not handled here.
 */
export function installElementSpread(
  element: Element,
  ...layers: unknown[]
): void {
  install(() => {
    const applied = new Map<string, unknown>();
    const listeners = new Map<string, Listener>();
    let known: Set<string> | undefined;

    const release = (key: string): void => {
      const listener = listeners.get(key);
      if (!listener) return;
      listeners.delete(key);
      element.removeEventListener(listener.type, listener.wrapper, {
        capture: listener.capture,
      });
    };

    cleanup(() => {
      for (const key of listeners.keys()) release(key);
      applied.clear();
    });

    createRenderEffect(() => {
      const merged = snapshot(layers);
      const attributes = new Map<string, unknown>();
      const events = new Map<string, unknown>();
      const keys = Object.keys(merged);
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index]!;
        const value = merged[key];
        if (key.startsWith("$$")) continue;
        if (key.length > 2 && key.startsWith("on")) {
          events.set(key, value);
          continue;
        }
        // Keep the native SSR event filter: never install inline handler strings.
        if (/^on/i.test(key)) continue;
        const name = key.toLowerCase();
        if (CONTENT.has(name))
          throw new TypeError(
            `Spread attribute ${JSON.stringify(key)} would overwrite element content`,
          );
        if (typeof value === "function" || !ATTRIBUTE_NAME.test(key)) continue;
        attributes.set(
          key,
          key === "class"
            ? classValue(value)
            : name === "style" && value != null
              ? String(value)
              : value,
        );
      }

      // Missing raw keys follow current keys, including case variants of one HTML name.
      for (const key of applied.keys()) {
        if (!attributes.has(key)) attributes.set(key, null);
      }
      for (const [key, value] of attributes) {
        const name = key.toLowerCase();
        if (
          applied.has(key) &&
          applied.get(key) === value &&
          !(value === undefined && element.hasAttribute(name))
        )
          continue;
        if (value == null) {
          element.removeAttribute(name);
        } else if (name === "style") {
          (element as HTMLElement).style.cssText = value as string;
        } else {
          const property = ALIASES[name] ?? name;
          if (
            typeof value !== "string" &&
            typeof value !== "boolean" &&
            (known ??= setters(element)).has(property)
          ) {
            (element as unknown as Record<string, unknown>)[property] = value;
          } else {
            const text =
              name === "class"
                ? (value as string)
                : sourceAttributeValue(name, value, true);
            if (text === undefined) element.removeAttribute(name);
            else element.setAttribute(name, text);
          }
        }
        applied.set(key, value);
      }

      for (const key of listeners.keys())
        if (typeof events.get(key) !== "function") release(key);
      for (const [key, value] of events) {
        if (typeof value !== "function") continue;
        const existing = listeners.get(key);
        if (existing) {
          existing.handler = value as Handler;
          continue;
        }
        let type = key.slice(2);
        const capture =
          type.endsWith("capture") &&
          type !== "gotpointercapture" &&
          type !== "lostpointercapture";
        if (capture) type = type.slice(0, -7);
        if (!type) continue;
        const listener: Listener = {
          type,
          capture,
          handler: value as Handler,
          wrapper(this: unknown, event: Event) {
            return listener.handler.call(this, event);
          },
        };
        listeners.set(key, listener);
        element.addEventListener(type, listener.wrapper, { capture });
      }
    });
  });
}
