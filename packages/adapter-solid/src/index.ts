/**
 * @tschk/moonshine-solid
 *
 * Solid gets a separate adapter — no shared vnode with React.
 * Bridges `@tschk/moonshine` signals into Solid's reactive model and
 * maps Crepus View IR onto solid-js elements via `solid-js/h`.
 */

import { createSignal as msCreateSignal, type Signal as MsSignal } from "@tschk/moonshine";
import {
  createSignal as solidCreateSignal,
  createEffect,
  type Accessor,
  type Setter,
  type JSX,
} from "solid-js";
import h from "solid-js/h";

/** Cast solid-js/h output through unknown (h returns ExpandableNode factories). */
function el(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): JSX.Element {
  return h(type, props, ...children) as unknown as JSX.Element;
}

/** Wrap a moonshine signal as a Solid accessor + setter pair. */
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

/** Create a Solid-friendly store backed by moonshine createSignal. */
export function createBridgedSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
  return fromMoonshineSignal(msCreateSignal(initial));
}

export type CrepusSolidNode = {
  kind: string;
  content?: string;
  label?: string;
  children?: CrepusSolidNode[];
  values?: number[];
  [key: string]: unknown;
};

export type CrepusSolidIr = {
  version?: number;
  root: CrepusSolidNode[];
};

function sparklinePolyline(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function asArray(nodes: CrepusSolidNode | CrepusSolidNode[] | undefined): CrepusSolidNode[] {
  if (!nodes) return [];
  return Array.isArray(nodes) ? nodes : [nodes];
}

function bindItem(template: CrepusSolidNode, item: unknown): CrepusSolidNode {
  const itemStr = item == null ? "" : String(item);
  const clone = structuredClone(template) as CrepusSolidNode;
  const walk = (n: CrepusSolidNode) => {
    if (typeof n.content === "string") {
      n.content = n.content.replaceAll("{item}", itemStr).replaceAll("$item", itemStr);
    }
    if (typeof n.label === "string") {
      n.label = n.label.replaceAll("{item}", itemStr).replaceAll("$item", itemStr);
    }
    for (const child of n.children ?? []) walk(child);
    if (n.then) for (const child of asArray(n.then as CrepusSolidNode | CrepusSolidNode[])) walk(child);
    if (n.else) for (const child of asArray(n.else as CrepusSolidNode | CrepusSolidNode[])) walk(child);
    if (n.itemTemplate) walk(n.itemTemplate as CrepusSolidNode);
  };
  walk(clone);
  return clone;
}

/**
 * Map View IR → Solid elements (separate from the React renderer).
 * Covers the same kind surface as `@tschk/crepus-moonshine` at a structural level.
 */
export function renderCrepusIrSolid(ir: CrepusSolidIr): JSX.Element {
  const kids = (ir.root ?? []).map((n, i) => renderNode(n, `s.${i}`));
  return el(
    "div",
    {
      "data-crepus-root": true,
      "data-crepus-target": "solid",
      "data-crepus-ir-version": ir.version ?? 1,
    },
    ...kids,
  );
}

function renderNode(node: CrepusSolidNode, key: string): JSX.Element {
  switch (node.kind) {
    case "text":
      return el("span", { "data-crepus-kind": "text" }, node.content ?? "");
    case "stack": {
      const axis = (node.axis as string) ?? "column";
      const row = axis === "horizontal" || axis === "row";
      const gap = (node.gap ?? node.spacing ?? 8) as number | string;
      return el(
        "div",
        {
          "data-crepus-kind": "stack",
          "data-axis": row ? "row" : "column",
          style: {
            display: "flex",
            "flex-direction": row ? "row" : "column",
            gap: typeof gap === "number" ? `${gap}px` : gap,
          },
        },
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      );
    }
    case "scroll": {
      const axis = (node.axis as string) ?? "vertical";
      return el(
        "div",
        {
          "data-crepus-kind": "scroll",
          "data-axis": axis,
          style: {
            "overflow-x": axis === "horizontal" || axis === "both" ? "auto" : "hidden",
            "overflow-y": axis === "vertical" || axis === "both" ? "auto" : "hidden",
          },
        },
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      );
    }
    case "button":
      return el(
        "button",
        {
          type: "button",
          "data-crepus-kind": "button",
          disabled: Boolean(node.disabled),
        },
        node.label ?? "",
      );
    case "toggle": {
      const pressed = Boolean(node.value);
      return el(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": pressed,
          "data-crepus-kind": "toggle",
        },
        node.label ?? (pressed ? "On" : "Off"),
      );
    }
    case "checkbox": {
      const checked = Boolean(node.value);
      return el(
        "label",
        {
          "data-crepus-kind": "checkbox",
          style: { display: "inline-flex", "align-items": "center", gap: "6px" },
        },
        el("input", { type: "checkbox", checked }),
        node.label ? el("span", null, node.label) : null,
      );
    }
    case "progress":
      return el("progress", {
        "data-crepus-kind": "progress",
        value: (node.value as number) ?? 0,
        max: (node.max as number) ?? 1,
      });
    case "meter":
      return el("meter", {
        "data-crepus-kind": "meter",
        value: (node.value as number) ?? 0,
        min: (node.min as number) ?? 0,
        max: (node.max as number) ?? 1,
        low: node.low as number | undefined,
        high: node.high as number | undefined,
        optimum: node.optimum as number | undefined,
      });
    case "sparkline": {
      const values = (node.values ?? []) as number[];
      const width = (node.width as number) ?? 120;
      const height = (node.height as number) ?? 32;
      const color = (node.color as string) ?? "currentColor";
      const points = sparklinePolyline(values, width, height);
      return el(
        "svg",
        {
          "data-crepus-kind": "sparkline",
          width,
          height,
          viewBox: `0 0 ${width} ${height}`,
          role: "img",
          "aria-label": "sparkline",
          style: { display: "block" },
        },
        el("polyline", {
          points,
          fill: "none",
          stroke: color,
          "stroke-width": 1.5,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        }),
      );
    }
    case "badge":
      return el("span", { "data-crepus-kind": "badge", "data-tone": node.tone }, node.label ?? "");
    case "divider": {
      const vertical = node.orientation === "vertical";
      return el(vertical ? "div" : "hr", {
        "data-crepus-kind": "divider",
        role: "separator",
        "aria-orientation": vertical ? "vertical" : "horizontal",
        style: vertical
          ? { width: "1px", "align-self": "stretch", background: "var(--ms-border, #333)", border: "none" }
          : { border: "none", "border-top": "1px solid var(--ms-border, #333)", margin: "8px 0" },
      });
    }
    case "spacer": {
      const size = node.size as number | string | undefined;
      const flex = node.flex as number | string | undefined;
      return el("div", {
        "data-crepus-kind": "spacer",
        "aria-hidden": true,
        style: {
          flex: flex ?? (size == null ? 1 : undefined),
          width: size,
          height: size,
        },
      });
    }
    case "image":
      return el("img", {
        "data-crepus-kind": "image",
        src: (node.src as string) ?? "",
        alt: (node.alt as string) ?? "",
        width: node.width as number | string | undefined,
        height: node.height as number | string | undefined,
      });
    case "if": {
      const branch = node.condition ? asArray(node.then as CrepusSolidNode | CrepusSolidNode[]) : asArray(node.else as CrepusSolidNode | CrepusSolidNode[]);
      return el(
        "div",
        {
          "data-crepus-kind": "if",
          "data-condition": String(Boolean(node.condition)),
        },
        ...branch.map((c, i) => renderNode(c, `${key}.${i}`)),
      );
    }
    case "forEach": {
      const items = (node.items as unknown[]) ?? [];
      const template = node.itemTemplate as CrepusSolidNode | undefined;
      if (template) {
        return el(
          "div",
          { "data-crepus-kind": "forEach" },
          ...items.map((item, i) => renderNode(bindItem(template, item), `${key}.${i}`)),
        );
      }
      return el(
        "div",
        { "data-crepus-kind": "forEach" },
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      );
    }
    case "list":
      return el(
        node.ordered ? "ol" : "ul",
        { "data-crepus-kind": "list" },
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      );
    case "listItem":
      return el(
        "li",
        { "data-crepus-kind": "listItem" },
        node.label ?? "",
        ...(node.children ?? []).map((c, i) => renderNode(c, `${key}.${i}`)),
      );
    default:
      return el("div", {
        "data-crepus-kind": node.kind,
        "data-crepus-unknown": "true",
      });
  }
}

export { msCreateSignal as createMoonshineSignal };
export type { MsSignal as MoonshineSignal };
