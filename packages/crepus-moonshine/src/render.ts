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

export function renderCrepusNode(node: ViewNode, key: string): ReactNode {
  const className = classNameOf(node);

  switch (node.kind) {
    case "text":
      return createElement("span", { key, className }, node.content);

    case "link":
      return createElement(
        "a",
        {
          key,
          className,
          href: node.href,
          target: node.target,
          rel: node.rel,
        },
        ...renderChildren(node.children, key),
      );

    case "stack":
    case "scroll":
      return createElement(
        "div",
        { key, className },
        ...renderChildren(node.children, key),
      );

    case "dropzone":
      return createElement(
        "div",
        { key, className, "aria-label": node.label },
        ...renderChildren(node.children, key),
      );

    case "list":
      return createElement(
        node.ordered ? "ol" : "ul",
        { key, className },
        ...renderChildren(node.children, key),
      );

    case "listItem":
      return createElement(
        "li",
        { key, className },
        ...renderChildren(node.children, key),
      );

    case "button":
      return createElement(
        "button",
        { key, className, type: "button" },
        node.label,
      );

    case "badge":
      return createElement(
        "span",
        { key, className, "data-tone": node.tone },
        node.label,
      );

    case "divider":
      return createElement("hr", { key, className });

    case "spacer":
      return createElement("div", { key, className, "aria-hidden": true });

    case "image":
      return createElement("img", {
        key,
        className,
        src: node.src,
        alt: node.alt ?? "",
      });

    case "webView":
      return createElement("iframe", { key, className, src: node.src });

    case "toggle":
      return createElement(
        "button",
        {
          key,
          className,
          type: "button",
          role: "switch",
          "aria-checked": node.checked,
        },
        node.label,
      );

    case "checkbox":
      return createElement(
        "label",
        { key, className },
        createElement("input", {
          key: `${key}.input`,
          type: "checkbox",
          defaultChecked: node.checked,
          name: node.bind,
        }),
        node.label,
      );

    case "slider":
      return createElement("input", {
        key,
        className,
        type: "range",
        defaultValue: node.value,
        min: node.min,
        max: node.max,
        step: node.step,
        name: node.bind,
      });

    case "progress":
      return createElement("progress", {
        key,
        className,
        value: node.value,
        max: node.max,
      });

    case "meter":
      return createElement("meter", {
        key,
        className,
        value: node.value,
        min: node.min,
        max: node.max,
      });

    case "input":
      return createElement(node.multiline ? "textarea" : "input", {
        key,
        className,
        type: node.multiline ? undefined : node.secure ? "password" : "text",
        placeholder: node.placeholder,
        name: node.bind,
      });

    case "picker":
      return createElement(
        "select",
        { key, className, name: node.bind },
        ...node.options.map((option, i) =>
          createElement(
            "option",
            { key: `${key}.${i}`, value: option.value },
            option.label,
          ),
        ),
      );

    case "filePicker":
      return createElement(
        "label",
        { key, className },
        createElement("input", {
          key: `${key}.input`,
          type: "file",
          accept: node.accept?.join(","),
          multiple: node.multiple,
        }),
        node.label,
      );

    case "slotRotate":
      return createElement(
        "span",
        {
          key,
          className,
          "data-crepus-slot-rotate": node.phrases.join("|"),
          "data-interval-ms": node.intervalMs,
        },
        node.phrases[0] ?? "",
      );

    case "tabs":
      return createElement(
        "div",
        { key, className },
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
      );

    // Control flow the parser could not resolve statically. The chosen branch is
    // rendered and the source expression kept as a data attribute.
    case "if":
      return createElement(
        "div",
        { key, className, "data-crepus-if": node.condition },
        ...renderChildren(node.thenChildren, key),
      );

    case "forEach":
      return createElement(
        "div",
        {
          key,
          className,
          "data-crepus-for-each": node.bind,
          "data-crepus-item": node.itemName,
        },
        ...renderChildren(node.itemBody, key),
      );

    default:
      return null;
  }
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
