import type { CrepusNode, StyleMap } from "./types";

export const BADGE_TONE_COLORS: Record<
  string,
  { background: string; color: string }
> = {
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

export function styleOf(node: { style?: StyleMap }): StyleMap | undefined {
  return node.style;
}

export function asArray(
  nodes: CrepusNode | CrepusNode[] | undefined,
): CrepusNode[] {
  if (!nodes) return [];
  return Array.isArray(nodes) ? nodes : [nodes];
}

/** Replace `{item}` / `$item` placeholders in content/label (and nested) fields. */
export function bindItemTemplate(
  template: CrepusNode,
  item: unknown,
): CrepusNode {
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

/** SVG path `d` for sparkline (React path element). */
export function sparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
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

/** SVG polyline `points` for sparkline (Solid polyline element). */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
): string {
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

export function badgeToneStyle(tone: string | undefined): {
  tone: string;
  background: string;
  color: string;
} {
  const key = (tone ?? "accent").toLowerCase();
  const colors = BADGE_TONE_COLORS[key] ?? BADGE_TONE_COLORS.accent!;
  return {
    tone: tone ?? "accent",
    background: colors.background,
    color: colors.color,
  };
}
