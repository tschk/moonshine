/** Opt-in form model policy; independent of Vue directives and compiler ABI. */
import { h } from "@tschk/moonshine-dom/dom";
import { equalModelValue } from "./model-equality";
import {
  createRenderEffect,
  getOwner,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";

export type TextModelModifiers = Readonly<{
  lazy?: boolean;
  trim?: boolean;
  number?: boolean;
}>;
const numeric = (value: string): string | number => {
  const number = Number.parseFloat(value);
  return Number.isNaN(number) ? value : number;
};

/** Install after attributes, before user input listeners, inside a live owner. */
export function bindTextModel(
  element: HTMLInputElement | HTMLTextAreaElement,
  read: () => unknown,
  write: (value: string | number) => void,
  modifiers: TextModelModifiers = {},
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Text models require a live native owner");
  if (
    !(element instanceof HTMLTextAreaElement) &&
    (!(element instanceof HTMLInputElement) ||
      ![
        "text",
        "search",
        "tel",
        "url",
        "email",
        "password",
        "number",
        "range",
      ].includes(element.type))
  )
    throw new TypeError(
      "Text models require a text or numeric input or textarea",
    );
  if (typeof read !== "function" || typeof write !== "function")
    throw new TypeError("Text models require getter/setter functions");
  const { lazy = false, trim = false, number = false } = modifiers;
  const castNumber = number || element.type === "number";
  let composing = false;
  const listen = (event: string, handler: () => void) => {
    element.addEventListener(event, handler);
    onCleanup(() => element.removeEventListener(event, handler));
  };
  listen(lazy ? "change" : "input", () => {
    if (composing) return;
    let value: string | number = trim ? element.value.trim() : element.value;
    if (castNumber) value = numeric(value);
    untrack(() => write(value));
  });
  if (trim)
    listen("change", () => {
      element.value = element.value.trim();
    });
  if (!lazy) {
    listen("compositionstart", () => {
      composing = true;
    });
    const end = () => {
      if (!composing) return;
      composing = false;
      element.dispatchEvent(
        new element.ownerDocument.defaultView!.Event("input"),
      );
    };
    listen("compositionend", end);
    listen("change", end);
  }
  let mounted = false;
  let previous: unknown;
  createRenderEffect(() => {
    const value = read();
    const oldValue = previous;
    previous = value;
    const next = value ?? "";
    if (mounted) {
      if (composing) return;
      const current =
        (number || element.type === "number") && !/^0\d/.test(element.value)
          ? numeric(element.value)
          : element.value;
      if (current === next) return;
      if (
        element.ownerDocument.activeElement === element &&
        element.type !== "range"
      ) {
        if (lazy && value === oldValue) return;
        if (trim && element.value.trim() === next) return;
      }
    }
    mounted = true;
    element.value = String(next);
  });
}

/** Compiler-facing element factory; props retain their live component accessors. */
export function createTextModel(
  tag: "input" | "textarea",
  props: Record<string, unknown>,
  read: () => unknown,
  write: (value: string | number) => void,
  modifiers: TextModelModifiers = {},
): HTMLInputElement | HTMLTextAreaElement {
  const attributes: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(props))
    if (!key.startsWith("on") && key !== "ref")
      attributes[key] = () => props[key];
  attributes.ref = (element: HTMLInputElement | HTMLTextAreaElement) => {
    bindTextModel(element, read, write, modifiers);
    if (typeof props.ref === "function")
      (props.ref as (node: HTMLInputElement | HTMLTextAreaElement) => void)(
        element,
      );
  };
  for (const key of Object.keys(props))
    if (key.startsWith("on")) attributes[key] = props[key];
  return h(tag, attributes) as HTMLInputElement | HTMLTextAreaElement;
}

/** Install after attributes; logical values retain their JavaScript types. */
export function bindCheckedModel(
  element: HTMLInputElement,
  read: () => unknown,
  write: (value: unknown) => void,
  props: Record<string, unknown> = {},
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Checked models require a live native owner");
  if (
    !(element instanceof HTMLInputElement) ||
    (element.type !== "checkbox" && element.type !== "radio")
  )
    throw new TypeError("Checked models require a checkbox or radio input");
  if (typeof read !== "function" || typeof write !== "function")
    throw new TypeError("Checked models require getter/setter functions");
  const radio = element.type === "radio";
  const checkedValue = (checked: boolean) => {
    const key = checked ? "true-value" : "false-value";
    return key in props ? props[key] : checked;
  };
  const change = () =>
    untrack(() => {
      const value = "value" in props ? props.value : element.value;
      if (radio) {
        write(value);
        return;
      }
      const model = read();
      const checked = element.checked;
      if (Array.isArray(model)) {
        const index = model.findIndex((entry) => equalModelValue(entry, value));
        if (checked && index < 0) write([...model, value]);
        else if (!checked && index >= 0) {
          const next = model.slice();
          next.splice(index, 1);
          write(next);
        }
      } else if (model instanceof Set) {
        const next = new Set(model);
        if (checked) next.add(value);
        else next.delete(value);
        write(next);
      } else write(checkedValue(checked));
    });
  element.addEventListener("change", change);
  onCleanup(() => element.removeEventListener("change", change));
  let previous: unknown;
  createRenderEffect(() => {
    const model = read();
    const value = props.value;
    const oldValue = previous;
    previous = model;
    if (radio) element.checked = equalModelValue(model, value);
    else if (Array.isArray(model))
      element.checked = model.some((entry) => equalModelValue(entry, value));
    else if (model instanceof Set) element.checked = model.has(value);
    else if (model !== oldValue)
      element.checked = equalModelValue(model, checkedValue(true));
  });
}

/** Compiler-facing checked input factory, with model handlers before user handlers. */
export function createCheckedModel(
  type: "checkbox" | "radio",
  props: Record<string, unknown>,
  read: () => unknown,
  write: (value: unknown) => void,
): HTMLInputElement {
  const attributes: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(props))
    if (
      !key.startsWith("on") &&
      key !== "checked" &&
      key !== "value" &&
      key !== "ref"
    )
      attributes[key] = () => props[key];
  if (props.value != null) attributes.value = () => props.value;
  attributes.type = type;
  attributes.ref = (element: HTMLInputElement) => {
    if ("checked" in props) element.checked = Boolean(props.checked);
    bindCheckedModel(element, read, write, props);
    if (typeof props.ref === "function")
      (props.ref as (node: HTMLInputElement) => void)(element);
  };
  for (const key of Object.keys(props))
    if (key.startsWith("on")) attributes[key] = props[key];
  return h("input", attributes) as HTMLInputElement;
}
