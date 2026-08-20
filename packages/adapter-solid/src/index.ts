/**
 * @tschk/moonshine-solid
 *
 * Solid gets a separate adapter — no shared vnode with React (AGENTS.md).
 * IR types come from `@tschk/crepuscularity-wasm`; host elements via solid-js/h.
 *
 * Prefer Solid signals in Solid apps. Bridge helpers exist only when sharing
 * a moonshine signal across host boundaries.
 */

import type { TabItem, ViewIr, ViewNode } from "@tschk/crepuscularity-wasm";
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";
import {
  createEffect,
  createSignal as solidCreateSignal,
  type Accessor,
  type JSX,
  type Setter,
} from "solid-js";
import { createComponent, Dynamic } from "solid-js/web";

/** Host elements go through `Dynamic` so the same tree renders on server and client. */
function el(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): JSX.Element {
  const merged: Record<string, unknown> = { component: type };
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value !== undefined) merged[name] = value;
  }
  if (children.length > 0) merged.children = children;
  return createComponent(Dynamic, merged as never) as unknown as JSX.Element;
}

/**
 * One-way mirror: moonshine signal → Solid accessor.
 * Prefer native `createSignal` from solid-js when staying in Solid.
 */
export function fromMoonshineSignal<T>(
  signal: MsSignal<T>,
): [Accessor<T>, Setter<T>] {
  const [get, set] = solidCreateSignal(signal());
  createEffect(() => {
    const unsub = signal.subscribe(() => set(() => signal()));
    return unsub;
  });
  return [
    get,
    ((v: T | ((prev: T) => T)) => {
      if (typeof v === "function") {
        signal.set(v as (prev: T) => T);
      } else {
        signal.set(v as T);
      }
      return signal();
    }) as Setter<T>,
  ];
}

/** Create a Solid pair backed by moonshine createSignal (cross-host share). */
export function createBridgedSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
  return fromMoonshineSignal(msCreateSignal(initial));
}

export type CrepusNode = ViewNode;
export type CrepusIr = ViewIr;

export interface RenderCrepusOptions {
  /** Wrapper element for the document root. */
  rootTag?: string;
}

/**
 * Class tokens are carried verbatim from the template, so UnoCSS/Tailwind
 * styles the output. The lowered `style` hints exist for native targets and are
 * deliberately not converted to inline CSS here.
 */
function classOf(node: ViewNode): string | undefined {
  const classes = (node as { style?: { classes?: string[] } }).style?.classes;
  if (!classes || classes.length === 0) return undefined;
  const joined = classes.filter(Boolean).join(" ");
  return joined.length > 0 ? joined : undefined;
}

function renderChildren(children: ViewNode[]): JSX.Element[] {
  return children.map((child) => renderCrepusNodeSolid(child));
}

const RENDERERS: Record<
  string,
  (node: any, cls: string | undefined) => JSX.Element
> = {
  text: (node, cls) => el("span", { class: cls }, node.content),
  link: (node, cls) =>
    el(
      "a",
      { class: cls, href: node.href, target: node.target, rel: node.rel },
      ...renderChildren(node.children),
    ),
  stack: (node, cls) =>
    el("div", { class: cls }, ...renderChildren(node.children)),
  scroll: (node, cls) =>
    el("div", { class: cls }, ...renderChildren(node.children)),
  dropzone: (node, cls) =>
    el(
      "div",
      { class: cls, "aria-label": node.label },
      ...renderChildren(node.children),
    ),
  list: (node, cls) =>
    el(
      node.ordered ? "ol" : "ul",
      { class: cls },
      ...renderChildren(node.children),
    ),
  listItem: (node, cls) =>
    el("li", { class: cls }, ...renderChildren(node.children)),
  button: (node, cls) =>
    el("button", { class: cls, type: "button" }, node.label),
  badge: (node, cls) =>
    el("span", { class: cls, "data-tone": node.tone }, node.label),
  divider: (node, cls) => el("hr", { class: cls }),
  spacer: (node, cls) => el("div", { class: cls, "aria-hidden": true }),
  image: (node, cls) =>
    el("img", { class: cls, src: node.src, alt: node.alt ?? "" }),
  webView: (node, cls) => el("iframe", { class: cls, src: node.src }),
  toggle: (node, cls) =>
    el(
      "button",
      {
        class: cls,
        type: "button",
        role: "switch",
        "aria-checked": node.checked,
      },
      node.label,
    ),
  checkbox: (node, cls) =>
    el(
      "label",
      { class: cls },
      el("input", { type: "checkbox", checked: node.checked, name: node.bind }),
      node.label,
    ),
  slider: (node, cls) =>
    el("input", {
      class: cls,
      type: "range",
      value: node.value,
      min: node.min,
      max: node.max,
      step: node.step,
      name: node.bind,
    }),
  progress: (node, cls) =>
    el("progress", { class: cls, value: node.value, max: node.max }),
  meter: (node, cls) =>
    el("meter", {
      class: cls,
      value: node.value,
      min: node.min,
      max: node.max,
    }),
  input: (node, cls) =>
    el(node.multiline ? "textarea" : "input", {
      class: cls,
      type: node.multiline ? undefined : node.secure ? "password" : "text",
      placeholder: node.placeholder,
      name: node.bind,
    }),
  picker: (node, cls) =>
    el(
      "select",
      { class: cls, name: node.bind },
      ...node.options.map((option: any) =>
        el("option", { value: option.value }, option.label),
      ),
    ),
  filePicker: (node, cls) =>
    el(
      "label",
      { class: cls },
      el("input", {
        type: "file",
        accept: node.accept?.join(","),
        multiple: node.multiple,
      }),
      node.label,
    ),
  slotRotate: (node, cls) =>
    el(
      "span",
      {
        class: cls,
        "data-crepus-slot-rotate": node.phrases.join("|"),
        "data-interval-ms": node.intervalMs,
      },
      node.phrases[0] ?? "",
    ),
  tabs: (node, cls) =>
    el(
      "div",
      { class: cls },
      el(
        "div",
        { role: "tablist" },
        ...node.tabs.map((tab: TabItem) =>
          el("button", { type: "button", role: "tab" }, tab.label),
        ),
      ),
      ...node.tabs.map((tab: TabItem) =>
        el("div", { role: "tabpanel" }, ...renderChildren(tab.children)),
      ),
    ),
  if: (node, cls) =>
    el(
      "div",
      { class: cls, "data-crepus-if": node.condition },
      ...renderChildren(node.thenChildren),
    ),
  forEach: (node, cls) =>
    el(
      "div",
      {
        class: cls,
        "data-crepus-for-each": node.bind,
        "data-crepus-item": node.itemName,
      },
      ...renderChildren(node.itemBody),
    ),
};

export function renderCrepusNodeSolid(node: ViewNode): JSX.Element {
  const cls = classOf(node);
  const renderer = RENDERERS[node.kind];
  if (renderer) {
    return renderer(node, cls);
  }
  return null as unknown as JSX.Element;
}

/**
 * Map View IR → Solid elements (separate from the React renderer).
 * Same kind surface as `@tschk/crepus-moonshine`, one IR source of truth.
 */
export function renderCrepusIrSolid(
  ir: ViewIr,
  options: RenderCrepusOptions = {},
): JSX.Element {
  const kids = (ir.root ?? []).map((node) => renderCrepusNodeSolid(node));
  return el(
    options.rootTag ?? "div",
    {
      "data-crepus-root": "true",
      "data-crepus-target": "solid",
      "data-crepus-ir-version": ir.version,
    },
    ...kids,
  );
}

export { msCreateSignal as createMoonshineSignal };
export type { MsSignal as MoonshineSignal };

// Core re-exports for Solid apps that share moonshine resources
export {
  createResource,
  createSignal as createMsSignal,
  createMemo,
  batch,
  untrack,
} from "@tschk/moonshine";
export type { Resource, ResourceStatus } from "@tschk/moonshine";
export { hydrateSolid, solidRenderer } from "./framework";
