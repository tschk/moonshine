/**
 * @tschk/moonshine-solid
 *
 * Solid gets a separate adapter — no shared vnode with React (AGENTS.md).
 * IR helpers come from `@tschk/crepus-moonshine/ir`; host elements via solid-js/h.
 *
 * Prefer Solid signals in Solid apps. Bridge helpers exist only when sharing
 * a moonshine signal across host boundaries.
 */

import {
  asArray,
  badgeToneStyle,
  bindItemTemplate,
  sparklinePoints,
  styleOf,
} from "@tschk/crepus-moonshine/ir";
import type {
  CrepusIr,
  CrepusNode,
  RenderCrepusOptions,
} from "@tschk/crepus-moonshine/types";
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
import h from "solid-js/h";

/** Cast solid-js/h output through unknown (h returns ExpandableNode factories). */
function el(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): JSX.Element {
  return h(type, props, ...children) as unknown as JSX.Element;
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

export type { CrepusIr, CrepusNode, RenderCrepusOptions };
/** @deprecated use CrepusNode */
export type CrepusSolidNode = CrepusNode;
/** @deprecated use CrepusIr */
export type CrepusSolidIr = CrepusIr;

function renderChildren(
  children: CrepusNode[] | undefined,
  options: RenderCrepusOptions,
  key: string,
): JSX.Element[] {
  return (children ?? []).map((c, i) => renderNode(c, options, `${key}.${i}`));
}

function renderNode(
  node: CrepusNode,
  options: RenderCrepusOptions,
  key: string,
): JSX.Element {
  switch (node.kind) {
    case "text": {
      const n = node as Extract<CrepusNode, { kind: "text" }>;
      return el(
        "span",
        { "data-crepus-kind": "text", style: styleOf(n) },
        n.content ?? "",
      );
    }
    case "stack": {
      const n = node as Extract<CrepusNode, { kind: "stack" }>;
      const axis = n.axis ?? "column";
      const row = axis === "horizontal" || axis === "row";
      const gap = n.gap ?? n.spacing ?? 8;
      return el(
        "div",
        {
          "data-crepus-kind": "stack",
          "data-axis": row ? "row" : "column",
          style: {
            display: "flex",
            "flex-direction": row ? "row" : "column",
            gap: typeof gap === "number" ? `${gap}px` : gap,
            ...styleOf(n),
          },
        },
        ...renderChildren(n.children, options, key),
      );
    }
    case "scroll": {
      const n = node as Extract<CrepusNode, { kind: "scroll" }>;
      const axis = n.axis ?? "vertical";
      return el(
        "div",
        {
          "data-crepus-kind": "scroll",
          "data-axis": axis,
          style: {
            "overflow-x":
              axis === "horizontal" || axis === "both" ? "auto" : "hidden",
            "overflow-y":
              axis === "vertical" || axis === "both" ? "auto" : "hidden",
            ...styleOf(n),
          },
        },
        ...renderChildren(n.children, options, key),
      );
    }
    case "button": {
      const n = node as Extract<CrepusNode, { kind: "button" }>;
      return el(
        "button",
        {
          type: "button",
          "data-crepus-kind": "button",
          "data-onclick": n.onClick,
          disabled: Boolean(n.disabled),
          style: styleOf(n),
          onClick: () => {
            if (n.onClick) options.onAction?.(n.onClick);
          },
        },
        n.label ?? "",
      );
    }
    case "toggle": {
      const n = node as Extract<CrepusNode, { kind: "toggle" }>;
      const pressed = Boolean(n.value);
      return el(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": pressed,
          "data-crepus-kind": "toggle",
          "data-onchange": n.onChange,
          style: styleOf(n),
          onClick: () => {
            if (n.onChange) options.onAction?.(n.onChange, !pressed);
          },
        },
        n.label ?? (pressed ? "On" : "Off"),
      );
    }
    case "checkbox": {
      const n = node as Extract<CrepusNode, { kind: "checkbox" }>;
      const checked = Boolean(n.value);
      return el(
        "label",
        {
          "data-crepus-kind": "checkbox",
          style: {
            display: "inline-flex",
            "align-items": "center",
            gap: "6px",
            ...styleOf(n),
          },
        },
        el("input", {
          type: "checkbox",
          checked,
          "data-onchange": n.onChange,
          onChange: (e: Event) => {
            const t = e.target as HTMLInputElement;
            if (n.onChange) options.onAction?.(n.onChange, t.checked);
          },
        }),
        n.label ? el("span", null, n.label) : null,
      );
    }
    case "progress": {
      const n = node as Extract<CrepusNode, { kind: "progress" }>;
      return el("progress", {
        "data-crepus-kind": "progress",
        value: n.value ?? 0,
        max: n.max ?? 1,
        style: styleOf(n),
      });
    }
    case "meter": {
      const n = node as Extract<CrepusNode, { kind: "meter" }>;
      return el("meter", {
        "data-crepus-kind": "meter",
        value: n.value ?? 0,
        min: n.min ?? 0,
        max: n.max ?? 1,
        low: n.low,
        high: n.high,
        optimum: n.optimum,
        style: styleOf(n),
      });
    }
    case "sparkline": {
      const n = node as Extract<CrepusNode, { kind: "sparkline" }>;
      const values = n.values ?? [];
      const width = n.width ?? 120;
      const height = n.height ?? 32;
      const color = n.color ?? "currentColor";
      const points = sparklinePoints(values, width, height);
      return el(
        "svg",
        {
          "data-crepus-kind": "sparkline",
          width,
          height,
          viewBox: `0 0 ${width} ${height}`,
          role: "img",
          "aria-label": "sparkline",
          style: { display: "block", ...styleOf(n) },
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
    case "badge": {
      const n = node as Extract<CrepusNode, { kind: "badge" }>;
      const tone = badgeToneStyle(n.tone);
      return el(
        "span",
        {
          "data-crepus-kind": "badge",
          "data-tone": tone.tone,
          style: {
            display: "inline-flex",
            "align-items": "center",
            padding: "2px 8px",
            "border-radius": "999px",
            "font-size": "12px",
            background: tone.background,
            color: tone.color,
            ...styleOf(n),
          },
        },
        n.label ?? "",
      );
    }
    case "divider": {
      const n = node as Extract<CrepusNode, { kind: "divider" }>;
      const vertical = n.orientation === "vertical";
      return el(vertical ? "div" : "hr", {
        "data-crepus-kind": "divider",
        role: "separator",
        "aria-orientation": vertical ? "vertical" : "horizontal",
        style: vertical
          ? {
              width: "1px",
              "align-self": "stretch",
              background: "var(--ms-border, #333)",
              border: "none",
              ...styleOf(n),
            }
          : {
              border: "none",
              "border-top": "1px solid var(--ms-border, #333)",
              margin: "8px 0",
              ...styleOf(n),
            },
      });
    }
    case "spacer": {
      const n = node as Extract<CrepusNode, { kind: "spacer" }>;
      return el("div", {
        "data-crepus-kind": "spacer",
        "aria-hidden": true,
        style: {
          flex: n.flex ?? (n.size == null ? 1 : undefined),
          width: n.size,
          height: n.size,
          ...styleOf(n),
        },
      });
    }
    case "image": {
      const n = node as Extract<CrepusNode, { kind: "image" }>;
      return el("img", {
        "data-crepus-kind": "image",
        src: n.src ?? "",
        alt: n.alt ?? "",
        width: n.width,
        height: n.height,
        style: styleOf(n),
      });
    }
    case "if": {
      const n = node as Extract<CrepusNode, { kind: "if" }>;
      const branch = n.condition ? asArray(n.then) : asArray(n.else);
      return el(
        "div",
        {
          "data-crepus-kind": "if",
          "data-condition": String(Boolean(n.condition)),
          style: styleOf(n),
        },
        ...renderChildren(branch, options, key),
      );
    }
    case "forEach": {
      const n = node as Extract<CrepusNode, { kind: "forEach" }>;
      const items = n.items ?? [];
      if (n.itemTemplate) {
        return el(
          "div",
          { "data-crepus-kind": "forEach", style: styleOf(n) },
          ...items.map((item, i) =>
            renderNode(
              bindItemTemplate(n.itemTemplate!, item),
              options,
              `${key}.${i}`,
            ),
          ),
        );
      }
      return el(
        "div",
        { "data-crepus-kind": "forEach", style: styleOf(n) },
        ...renderChildren(n.children, options, key),
      );
    }
    case "list": {
      const n = node as Extract<CrepusNode, { kind: "list" }>;
      return el(
        n.ordered ? "ol" : "ul",
        {
          "data-crepus-kind": "list",
          style: { margin: 0, "padding-left": "20px", ...styleOf(n) },
        },
        ...renderChildren(n.children, options, key),
      );
    }
    case "listItem": {
      const n = node as Extract<CrepusNode, { kind: "listItem" }>;
      const kids =
        n.children && n.children.length > 0
          ? renderChildren(n.children, options, key)
          : [n.label ?? ""];
      return el(
        "li",
        { "data-crepus-kind": "listItem", style: styleOf(n) },
        ...kids,
      );
    }
    default:
      return el("div", {
        "data-crepus-kind": String((node as { kind: string }).kind),
        "data-crepus-unknown": "true",
      });
  }
}

/**
 * Map View IR → Solid elements (separate from the React renderer).
 * Same kind surface as `@tschk/crepus-moonshine` via shared IR helpers.
 */
export function renderCrepusIrSolid(
  ir: CrepusIr,
  options: RenderCrepusOptions = {},
): JSX.Element {
  const prefix = options.keyPrefix ?? "s";
  const kids = (ir.root ?? []).map((n, i) =>
    renderNode(n, options, `${prefix}.${i}`),
  );
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
