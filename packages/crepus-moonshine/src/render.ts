import { createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type {
  CrepusIr,
  CrepusNode,
  RenderCrepusOptions,
  StyleMap,
} from "./types";

export type {
  CrepusIr,
  CrepusNode,
  RenderCrepusOptions,
  ViewIr,
} from "./types";

const BADGE_TONE_COLORS: Record<string, { background: string; color: string }> = {
  accent: {
    background: "var(--ms-accent, #358ff3)",
    color: "var(--ms-accent-fg, #fff)",
  },
  danger: {
    background: "var(--ms-danger, #e5484d)",
    color: "var(--ms-danger-fg, #fff)",
  },
  muted: {
    background: "var(--ms-muted, #5c5c64)",
    color: "var(--ms-muted-fg, #fff)",
  },
  success: {
    background: "var(--ms-success, #30a46c)",
    color: "var(--ms-success-fg, #fff)",
  },
  warning: {
    background: "var(--ms-warning, #f5a524)",
    color: "var(--ms-warning-fg, #111)",
  },
};

function styleOf(node: { style?: StyleMap }): CSSProperties | undefined {
  return node.style as CSSProperties | undefined;
}

function asArray(nodes: CrepusNode | CrepusNode[] | undefined): CrepusNode[] {
  if (!nodes) return [];
  return Array.isArray(nodes) ? nodes : [nodes];
}

/** Replace `{item}` / `$item` placeholders in content/label (and nested) fields. */
function bindItemTemplate(template: CrepusNode, item: unknown): CrepusNode {
  const itemStr = item == null ? "" : String(item);
  const clone = structuredClone(template) as CrepusNode;

  const replace = (value: string) =>
    value.replaceAll("{item}", itemStr).replaceAll("$item", itemStr);

  const walk = (n: CrepusNode): void => {
    const rec = n as CrepusNode & {
      content?: string;
      label?: string;
      children?: CrepusNode[];
      then?: CrepusNode | CrepusNode[];
      else?: CrepusNode | CrepusNode[];
      itemTemplate?: CrepusNode;
    };
    if (typeof rec.content === "string") rec.content = replace(rec.content);
    if (typeof rec.label === "string") rec.label = replace(rec.label);
    for (const child of rec.children ?? []) walk(child);
    for (const child of asArray(rec.then)) walk(child);
    for (const child of asArray(rec.else)) walk(child);
    if (rec.itemTemplate) walk(rec.itemTemplate);
  };

  walk(clone);
  return clone;
}

function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderChildren(
  children: CrepusNode[] | undefined,
  options: RenderCrepusOptions,
  key: string,
): ReactNode[] {
  return (children ?? []).map((child, i) =>
    renderCrepusNode(child, options, `${key}.${i}`),
  );
}

/** Map one IR node to a moonshine/React element. */
export function renderCrepusNode(
  node: CrepusNode,
  options: RenderCrepusOptions = {},
  key = "0",
): ReactNode {
  switch (node.kind) {
    case "text": {
      const n = node as Extract<CrepusNode, { kind: "text" }>;
      return createElement(
        "span",
        { key, "data-crepus-kind": "text", style: styleOf(n) },
        n.content ?? "",
      );
    }
    case "stack": {
      const n = node as Extract<CrepusNode, { kind: "stack" }>;
      const axis = n.axis ?? "column";
      const row = axis === "horizontal" || axis === "row";
      const style: CSSProperties = {
        display: "flex",
        flexDirection: row ? "row" : "column",
        gap: n.gap ?? n.spacing ?? 8,
        ...styleOf(n),
      };
      return createElement(
        "div",
        {
          key,
          "data-crepus-kind": "stack",
          "data-axis": row ? "row" : "column",
          style,
        },
        renderChildren(n.children, options, key),
      );
    }
    case "scroll": {
      const n = node as Extract<CrepusNode, { kind: "scroll" }>;
      const axis = n.axis ?? "vertical";
      const style: CSSProperties = {
        overflowX: axis === "horizontal" || axis === "both" ? "auto" : "hidden",
        overflowY: axis === "vertical" || axis === "both" ? "auto" : "hidden",
        ...styleOf(n),
      };
      return createElement(
        "div",
        { key, "data-crepus-kind": "scroll", "data-axis": axis, style },
        renderChildren(n.children, options, key),
      );
    }
    case "button": {
      const n = node as Extract<CrepusNode, { kind: "button" }>;
      return createElement(
        "button",
        {
          key,
          type: "button",
          "data-crepus-kind": "button",
          "data-onclick": n.onClick,
          disabled: n.disabled,
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
      return createElement(
        "button",
        {
          key,
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
      return createElement(
        "label",
        {
          key,
          "data-crepus-kind": "checkbox",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            ...styleOf(n),
          },
        },
        createElement("input", {
          type: "checkbox",
          checked,
          "data-onchange": n.onChange,
          onChange: (e: { target: { checked: boolean } }) => {
            if (n.onChange) options.onAction?.(n.onChange, e.target.checked);
          },
        }),
        n.label ? createElement("span", null, n.label) : null,
      );
    }
    case "progress": {
      const n = node as Extract<CrepusNode, { kind: "progress" }>;
      const max = n.max ?? 1;
      const value = n.value ?? 0;
      return createElement("progress", {
        key,
        "data-crepus-kind": "progress",
        value,
        max,
        style: styleOf(n),
      });
    }
    case "meter": {
      const n = node as Extract<CrepusNode, { kind: "meter" }>;
      return createElement("meter", {
        key,
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
      const width = n.width ?? 120;
      const height = n.height ?? 32;
      const values = n.values ?? [];
      const color = n.color ?? "currentColor";
      const d = sparklinePath(values, width, height);
      return createElement(
        "svg",
        {
          key,
          "data-crepus-kind": "sparkline",
          width,
          height,
          viewBox: `0 0 ${width} ${height}`,
          style: { display: "block", ...styleOf(n) },
          role: "img",
          "aria-label": "sparkline",
        },
        createElement("path", {
          d,
          fill: "none",
          stroke: color,
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }),
      );
    }
    case "badge": {
      const n = node as Extract<CrepusNode, { kind: "badge" }>;
      const toneKey = (n.tone ?? "accent").toLowerCase();
      const toneColors = BADGE_TONE_COLORS[toneKey] ?? BADGE_TONE_COLORS.accent;
      return createElement(
        "span",
        {
          key,
          "data-crepus-kind": "badge",
          "data-tone": n.tone ?? "accent",
          style: {
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 12,
            background: toneColors.background,
            color: toneColors.color,
            ...styleOf(n),
          },
        },
        n.label ?? "",
      );
    }
    case "divider": {
      const n = node as Extract<CrepusNode, { kind: "divider" }>;
      const vertical = n.orientation === "vertical";
      return createElement(vertical ? "div" : "hr", {
        key,
        "data-crepus-kind": "divider",
        role: "separator",
        "aria-orientation": vertical ? "vertical" : "horizontal",
        style: vertical
          ? {
              width: 1,
              alignSelf: "stretch",
              background: "var(--ms-border, #333)",
              border: "none",
              ...styleOf(n),
            }
          : {
              border: "none",
              borderTop: "1px solid var(--ms-border, #333)",
              margin: "8px 0",
              ...styleOf(n),
            },
      });
    }
    case "spacer": {
      const n = node as Extract<CrepusNode, { kind: "spacer" }>;
      return createElement("div", {
        key,
        "data-crepus-kind": "spacer",
        "aria-hidden": true,
        style: {
          flex: n.flex ?? (n.size == null ? 1 : undefined),
          width: typeof n.size === "number" ? n.size : n.size,
          height: typeof n.size === "number" ? n.size : n.size,
          ...styleOf(n),
        },
      });
    }
    case "image": {
      const n = node as Extract<CrepusNode, { kind: "image" }>;
      return createElement("img", {
        key,
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
      return createElement(
        "div",
        {
          key,
          "data-crepus-kind": "if",
          "data-condition": String(Boolean(n.condition)),
          style: styleOf(n),
        },
        renderChildren(branch, options, key),
      );
    }
    case "forEach": {
      const n = node as Extract<CrepusNode, { kind: "forEach" }>;
      const items = n.items ?? [];
      if (n.itemTemplate) {
        const kids = items.map((item, i) =>
          renderCrepusNode(bindItemTemplate(n.itemTemplate!, item), options, `${key}.${i}`),
        );
        return createElement(
          "div",
          { key, "data-crepus-kind": "forEach", style: styleOf(n) },
          kids,
        );
      }
      return createElement(
        "div",
        { key, "data-crepus-kind": "forEach", style: styleOf(n) },
        renderChildren(n.children, options, key),
      );
    }
    case "list": {
      const n = node as Extract<CrepusNode, { kind: "list" }>;
      const tag = n.ordered ? "ol" : "ul";
      return createElement(
        tag,
        {
          key,
          "data-crepus-kind": "list",
          style: { margin: 0, paddingLeft: 20, ...styleOf(n) },
        },
        renderChildren(n.children, options, key),
      );
    }
    case "listItem": {
      const n = node as Extract<CrepusNode, { kind: "listItem" }>;
      const kids =
        n.children && n.children.length > 0
          ? renderChildren(n.children, options, key)
          : [n.label ?? ""];
      return createElement(
        "li",
        { key, "data-crepus-kind": "listItem", style: styleOf(n) },
        kids,
      );
    }
    default:
      return createElement(
        "div",
        {
          key,
          "data-crepus-kind": String((node as { kind: string }).kind),
          "data-crepus-unknown": "true",
        },
        null,
      );
  }
}

/**
 * Map a crepuscularity JSON IR tree to moonshine React elements.
 */
export function renderCrepusIr(
  ir: CrepusIr,
  options: RenderCrepusOptions = {},
): ReactElement {
  const prefix = options.keyPrefix ?? "crepus";
  const children = (ir.root ?? []).map((node, i) =>
    renderCrepusNode(node, options, `${prefix}.${i}`),
  );
  return createElement(
    "div",
    {
      "data-crepus-root": "true",
      "data-crepus-ir-version": ir.version ?? 1,
    },
    children,
  );
}
