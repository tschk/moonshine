/** Opt-in Vue source select policy; independent of Svelte default/reset adoption. */
import { h, type DOMChild } from "@tschk/moonshine-dom/dom";
import {
  createRenderEffect,
  getOwner,
  getRenderScheduler,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { equalModelValue } from "./model-equality";

const values = new WeakMap<HTMLOptionElement, unknown>();
const refresh = new WeakMap<HTMLSelectElement, () => void>();
const valueOf = (option: HTMLOptionElement): unknown =>
  values.has(option) ? values.get(option) : option.value;

/** Bind after options; the returned refresh also supports factories building children. */
export function bindSelectModel(
  select: HTMLSelectElement,
  read: () => unknown,
  write: (value: unknown) => void,
  number = false,
): () => void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Select models require a live native owner");
  if (!(select instanceof HTMLSelectElement))
    throw new TypeError("Select models require a select element");
  if (typeof read !== "function" || typeof write !== "function")
    throw new TypeError("Select models require getter/setter functions");
  if (refresh.has(select))
    throw new Error("Select already has a model binding");
  let active = true;
  let assigning = false;
  const apply = () => {
    const model = read();
    if (!active) return;
    if (select.multiple) {
      if (!Array.isArray(model) && !(model instanceof Set)) return;
      for (const option of select.options) {
        const value = valueOf(option);
        const selected =
          model instanceof Set
            ? model.has(value)
            : model.some((entry) => equalModelValue(entry, value));
        if (!assigning) option.selected = selected;
      }
    } else {
      let found = false;
      for (const option of select.options) {
        const matches = !found && equalModelValue(model, valueOf(option));
        if (!assigning) option.selected = matches;
        if (matches) found = true;
      }
      if (!found && !assigning) select.selectedIndex = -1;
    }
  };
  const change = () =>
    untrack(() => {
      const selected = Array.from(select.options)
        .filter((option) => option.selected)
        .map((option) => {
          const value = valueOf(option);
          if (!number || typeof value !== "string") return value;
          const parsed = Number.parseFloat(value);
          return Number.isNaN(parsed) ? value : parsed;
        });
      const model = read();
      assigning = true;
      try {
        write(
          select.multiple
            ? model instanceof Set
              ? new Set(selected)
              : selected
            : selected[0],
        );
      } finally {
        queueMicrotask(() => {
          assigning = false;
        });
      }
    });
  select.addEventListener("change", change);
  const observer = new MutationObserver(() => {
    if (active) untrack(apply);
  });
  refresh.set(select, apply);
  onCleanup(() => {
    active = false;
    observer.disconnect();
    refresh.delete(select);
    select.removeEventListener("change", change);
  });
  createRenderEffect(apply);
  observer.observe(select, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["value", "selected", "multiple"],
  });
  return () => untrack(apply);
}

/** Compiler-facing typed option; omitted values retain the DOM text fallback. */
export function createModelOption(
  props: Record<string, unknown>,
  children: DOMChild,
): HTMLOptionElement {
  const attributes: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(props))
    if (key !== "ref")
      attributes[key] = key.startsWith("on") ? props[key] : () => props[key];
  if ("ref" in props)
    attributes.ref = (option: HTMLOptionElement) => {
      if (typeof props.ref === "function")
        (props.ref as (node: HTMLOptionElement) => void)(option);
    };
  const option = h("option", attributes, children);
  if ("value" in props)
    createRenderEffect(() => {
      values.set(option, props.value);
      const select = option.closest("select");
      if (select) untrack(() => refresh.get(select)?.());
    });
  return option;
}

/** Register the model before user handlers, then synchronously select built options. */
export function createSelectModel(
  props: Record<string, unknown>,
  read: () => unknown,
  write: (value: unknown) => void,
  children: DOMChild,
  number = false,
): HTMLSelectElement {
  const attributes: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(props))
    if (!key.startsWith("on") && key !== "ref")
      attributes[key] = () => props[key];
  let apply!: () => void;
  attributes.ref = (select: HTMLSelectElement) => {
    apply = bindSelectModel(select, read, write, number);
  };
  for (const key of Object.keys(props))
    if (key.startsWith("on")) attributes[key] = props[key];
  const select = h("select", attributes, children);
  apply();
  if (typeof props.ref === "function")
    (props.ref as (node: HTMLSelectElement) => void)(select);
  return select;
}

/** Compiler helper elements share the authored component's update group. */
export function captureSelectScope(): <T>(fn: () => T) => T {
  const scheduler = getRenderScheduler();
  return (fn) => (scheduler ? scheduler.branch(fn) : fn());
}
