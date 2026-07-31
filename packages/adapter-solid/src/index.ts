/**
 * @tschk/moonshine-solid
 *
 * Solid gets a separate adapter — no shared vnode with React (AGENTS.md).
 * IR types come from `@tschk/crepus-wasm`; host elements via solid-js/h.
 *
 * Prefer Solid signals in Solid apps. Bridge helpers exist only when sharing
 * a moonshine signal across host boundaries.
 */

import type { TabItem, ViewIr, ViewNode } from "@tschk/crepus-wasm";
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

export function renderCrepusNodeSolid(node: ViewNode): JSX.Element {
  const cls = classOf(node);

  switch (node.kind) {
    case "text":
      return el("span", { class: cls }, node.content);

    case "link":
      return el(
        "a",
        { class: cls, href: node.href, target: node.target, rel: node.rel },
        ...renderChildren(node.children),
      );

    case "stack":
    case "scroll":
      return el("div", { class: cls }, ...renderChildren(node.children));

    case "dropzone":
      return el(
        "div",
        { class: cls, "aria-label": node.label },
        ...renderChildren(node.children),
      );

    case "list":
      return el(
        node.ordered ? "ol" : "ul",
        { class: cls },
        ...renderChildren(node.children),
      );

    case "listItem":
      return el("li", { class: cls }, ...renderChildren(node.children));

    case "button":
      return el("button", { class: cls, type: "button" }, node.label);

    case "badge":
      return el("span", { class: cls, "data-tone": node.tone }, node.label);

    case "divider":
      return el("hr", { class: cls });

    case "spacer":
      return el("div", { class: cls, "aria-hidden": true });

    case "image":
      return el("img", { class: cls, src: node.src, alt: node.alt ?? "" });

    case "webView":
      return el("iframe", { class: cls, src: node.src });

    case "toggle":
      return el(
        "button",
        {
          class: cls,
          type: "button",
          role: "switch",
          "aria-checked": node.checked,
        },
        node.label,
      );

    case "checkbox":
      return el(
        "label",
        { class: cls },
        el("input", {
          type: "checkbox",
          checked: node.checked,
          name: node.bind,
        }),
        node.label,
      );

    case "slider":
      return el("input", {
        class: cls,
        type: "range",
        value: node.value,
        min: node.min,
        max: node.max,
        step: node.step,
        name: node.bind,
      });

    case "progress":
      return el("progress", { class: cls, value: node.value, max: node.max });

    case "meter":
      return el("meter", {
        class: cls,
        value: node.value,
        min: node.min,
        max: node.max,
      });

    case "input":
      return el(node.multiline ? "textarea" : "input", {
        class: cls,
        type: node.multiline ? undefined : node.secure ? "password" : "text",
        placeholder: node.placeholder,
        name: node.bind,
      });

    case "picker":
      return el(
        "select",
        { class: cls, name: node.bind },
        ...node.options.map((option) =>
          el("option", { value: option.value }, option.label),
        ),
      );

    case "filePicker":
      return el(
        "label",
        { class: cls },
        el("input", {
          type: "file",
          accept: node.accept?.join(","),
          multiple: node.multiple,
        }),
        node.label,
      );

    case "slotRotate":
      return el(
        "span",
        {
          class: cls,
          "data-crepus-slot-rotate": node.phrases.join("|"),
          "data-interval-ms": node.intervalMs,
        },
        node.phrases[0] ?? "",
      );

    case "tabs":
      return el(
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
      );

    // Control flow the parser could not resolve statically. The chosen branch is
    // rendered and the source expression kept as a data attribute.
    case "if":
      return el(
        "div",
        { class: cls, "data-crepus-if": node.condition },
        ...renderChildren(node.thenChildren),
      );

    case "forEach":
      return el(
        "div",
        {
          class: cls,
          "data-crepus-for-each": node.bind,
          "data-crepus-item": node.itemName,
        },
        ...renderChildren(node.itemBody),
      );

    default:
      return null as unknown as JSX.Element;
  }
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
