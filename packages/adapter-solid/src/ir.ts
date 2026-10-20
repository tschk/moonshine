/** Static View IR mapping parameterized by independent DOM or SSR factories. */
import type { TabItem, ViewIr, ViewNode } from "@tschk/crepuscularity-wasm";

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

export function createIrRenderer<Child>(
  el: (
    tag: string,
    props: Record<string, unknown> | null,
    ...children: Array<Child | string | number | boolean | null | undefined>
  ) => Child,
) {
  function renderChildren(children: ViewNode[]): Child[] {
    return children.map((child) => renderCrepusNodeSolid(child));
  }

  const RENDERERS: {
    [K in ViewNode["kind"]]?: (
      node: Extract<ViewNode, { kind: K }>,
      cls: string | undefined,
    ) => Child;
  } = {
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
        el("input", {
          type: "checkbox",
          checked: node.checked,
          name: node.bind,
        }),
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

  function renderCrepusNodeSolid(node: ViewNode): Child {
    if (!Object.hasOwn(RENDERERS, node.kind)) {
      throw new TypeError(`Unsupported View IR node kind: ${node.kind}`);
    }
    const cls = classOf(node);
    const renderer = RENDERERS[node.kind as keyof typeof RENDERERS];
    return renderer!(node as any, cls);
  }

  /**
   * Static mapping only: if/forEach preserve their authored placeholder children.
   * Compile source through Crepus for executable conditions, loops and handlers.
   */
  function renderCrepusIrSolid(
    ir: ViewIr,
    options: RenderCrepusOptions = {},
  ): Child {
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

  return { renderCrepusNodeSolid, renderCrepusIrSolid };
}
