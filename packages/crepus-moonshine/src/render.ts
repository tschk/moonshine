import { createElement, type ReactElement, type ReactNode } from "react";
import type { TabItem, ViewIr, ViewNode } from "@tschk/crepuscularity-wasm";

export type CrepusNode = ViewNode;

export interface RenderCrepusOptions {
  /** Wrapper element for the document root. */
  rootTag?: string;
}

/**
 * Class tokens are carried verbatim from the template, so UnoCSS/Tailwind
 * styles the output. The lowered `style` hints exist for native targets and are
 * deliberately not converted to inline CSS here.
 */
function idOf(node: ViewNode): string | undefined {
  const id = (node as { style?: { id?: string } }).style?.id;
  return id && id.length > 0 ? id : undefined;
}

function classNameOf(node: ViewNode): string | undefined {
  const classes = (node as { style?: { classes?: string[] } }).style?.classes;
  if (!classes || classes.length === 0) return undefined;
  const joined = classes.filter(Boolean).join(" ");
  return joined.length > 0 ? joined : undefined;
}

function renderChildren(children: ViewNode[], keyPrefix: string): ReactNode[] {
  return children.map((child, i) =>
    renderCrepusNode(child, `${keyPrefix}.${i}`),
  );
}

type NodeRenderer<T extends ViewNode["kind"]> = (
  node: Extract<ViewNode, { kind: T }>,
  key: string,
  id: string | undefined,
  className: string | undefined,
) => ReactNode;

const nodeRenderers: { [K in ViewNode["kind"]]: NodeRenderer<K> } = {
  text: (node, key, id, className) =>
    createElement("span", { key, id, className }, node.content),

  link: (node, key, id, className) =>
    createElement(
      "a",
      {
        key,
        id,
        className,
        href: node.href,
        target: node.target,
        rel: node.rel,
      },
      ...renderChildren(node.children, key),
    ),

  stack: (node, key, id, className) =>
    createElement(
      "div",
      { key, id, className },
      ...renderChildren(node.children, key),
    ),

  scroll: (node, key, id, className) =>
    createElement(
      "div",
      { key, id, className },
      ...renderChildren(node.children, key),
    ),

  dropzone: (node, key, id, className) =>
    createElement(
      "div",
      { key, id, className, "aria-label": node.label },
      ...renderChildren(node.children, key),
    ),

  list: (node, key, id, className) =>
    createElement(
      node.ordered ? "ol" : "ul",
      { key, id, className },
      ...renderChildren(node.children, key),
    ),

  listItem: (node, key, id, className) =>
    createElement(
      "li",
      { key, id, className },
      ...renderChildren(node.children, key),
    ),

  button: (node, key, id, className) =>
    createElement("button", { key, id, className, type: "button" }, node.label),

  badge: (node, key, id, className) =>
    createElement(
      "span",
      { key, id, className, "data-tone": node.tone },
      node.label,
    ),

  divider: (node, key, id, className) =>
    createElement("hr", { key, id, className }),

  spacer: (node, key, id, className) =>
    createElement("div", { key, id, className, "aria-hidden": true }),

  image: (node, key, id, className) =>
    createElement("img", {
      key,
      id,
      className,
      src: node.src,
      alt: node.alt ?? "",
    }),

  webView: (node, key, id, className) =>
    createElement("iframe", { key, id, className, src: node.src }),

  toggle: (node, key, id, className) =>
    createElement(
      "button",
      {
        key,
        id,
        className,
        type: "button",
        role: "switch",
        "aria-checked": node.checked,
      },
      node.label,
    ),

  checkbox: (node, key, id, className) =>
    createElement(
      "label",
      { key, id, className },
      createElement("input", {
        key: `${key}.input`,
        type: "checkbox",
        defaultChecked: node.checked,
        name: node.bind,
      }),
      node.label,
    ),

  slider: (node, key, id, className) =>
    createElement("input", {
      key,
      id,
      className,
      type: "range",
      defaultValue: node.value,
      min: node.min,
      max: node.max,
      step: node.step,
      name: node.bind,
    }),

  progress: (node, key, id, className) =>
    createElement("progress", {
      key,
      id,
      className,
      value: node.value,
      max: node.max,
    }),

  meter: (node, key, id, className) =>
    createElement("meter", {
      key,
      id,
      className,
      value: node.value,
      min: node.min,
      max: node.max,
    }),

  input: (node, key, id, className) =>
    createElement(node.multiline ? "textarea" : "input", {
      key,
      id,
      className,
      type: node.multiline ? undefined : node.secure ? "password" : "text",
      placeholder: node.placeholder,
      name: node.bind,
    }),

  picker: (node, key, id, className) =>
    createElement(
      "select",
      { key, id, className, name: node.bind },
      ...node.options.map((option, i) =>
        createElement(
          "option",
          { key: `${key}.${i}`, value: option.value },
          option.label,
        ),
      ),
    ),

  filePicker: (node, key, id, className) =>
    createElement(
      "label",
      { key, id, className },
      createElement("input", {
        key: `${key}.input`,
        type: "file",
        accept: node.accept?.join(","),
        multiple: node.multiple,
      }),
      node.label,
    ),

  slotRotate: (node, key, id, className) =>
    createElement(
      "span",
      {
        key,
        id,
        className,
        "data-crepus-slot-rotate": node.phrases.join("|"),
        "data-interval-ms": node.intervalMs,
      },
      node.phrases[0] ?? "",
    ),

  tabs: (node, key, id, className) =>
    createElement(
      "div",
      { key, id, className },
      createElement(
        "div",
        { key: `${key}.tablist`, role: "tablist" },
        ...node.tabs.map((tab: TabItem, i: number) =>
          createElement(
            "button",
            { key: `${key}.tab.${i}`, type: "button", role: "tab" },
            tab.label,
          ),
        ),
      ),
      ...node.tabs.map((tab: TabItem, i: number) =>
        createElement(
          "div",
          { key: `${key}.panel.${i}`, role: "tabpanel" },
          ...renderChildren(tab.children, `${key}.panel.${i}`),
        ),
      ),
    ),

  // Control flow the parser could not resolve statically. The chosen branch is
  // rendered and the source expression kept as a data attribute.
  if: (node, key, id, className) =>
    createElement(
      "div",
      { key, id, className, "data-crepus-if": node.condition },
      ...renderChildren(node.thenChildren, key),
    ),

  forEach: (node, key, id, className) =>
    createElement(
      "div",
      {
        key,
        id,
        className,
        "data-crepus-for-each": node.bind,
        "data-crepus-item": node.itemName,
      },
      ...renderChildren(node.itemBody, key),
    ),
};

export function renderCrepusNode(node: ViewNode, key: string): ReactNode {
  const className = classNameOf(node);
  const id = idOf(node);

  const renderer = nodeRenderers[node.kind];
  if (renderer) {
    // Cast is necessary because TypeScript cannot correlate the discriminated
    // union `node` with the generic function retrieved from `nodeRenderers`.
    return (renderer as any)(node, key, id, className);
  }
  return null;
}

export function renderCrepusIr(
  ir: ViewIr,
  options: RenderCrepusOptions = {},
): ReactElement {
  const children = (ir.root ?? []).map((node, i) =>
    renderCrepusNode(node, `k${i}`),
  );
  return createElement(
    options.rootTag ?? "div",
    { "data-crepus-root": "true", "data-crepus-ir-version": ir.version },
    ...children,
  );
}
