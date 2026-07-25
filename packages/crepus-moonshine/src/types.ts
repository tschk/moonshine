import type { CSSProperties } from "react";

export type StyleMap = Record<string, string | number>;

export type CrepusTextNode = {
  kind: "text";
  content?: string;
  style?: StyleMap;
};

export type CrepusStackNode = {
  kind: "stack";
  axis?: "horizontal" | "vertical" | "row" | "column";
  children?: CrepusNode[];
  style?: StyleMap;
  gap?: number | string;
  /** Alias for `gap` (emit / View IR compatibility). */
  spacing?: number | string;
};

export type CrepusScrollNode = {
  kind: "scroll";
  axis?: "horizontal" | "vertical" | "both";
  children?: CrepusNode[];
  style?: StyleMap;
};

export type CrepusButtonNode = {
  kind: "button";
  label?: string;
  onClick?: string;
  disabled?: boolean;
  style?: StyleMap;
};

export type CrepusToggleNode = {
  kind: "toggle";
  label?: string;
  value?: boolean;
  onChange?: string;
  style?: StyleMap;
};

export type CrepusCheckboxNode = {
  kind: "checkbox";
  label?: string;
  value?: boolean;
  onChange?: string;
  style?: StyleMap;
};

export type CrepusProgressNode = {
  kind: "progress";
  value?: number;
  max?: number;
  style?: StyleMap;
};

export type CrepusMeterNode = {
  kind: "meter";
  value?: number;
  min?: number;
  max?: number;
  low?: number;
  high?: number;
  optimum?: number;
  style?: StyleMap;
};

export type CrepusSparklineNode = {
  kind: "sparkline";
  values?: number[];
  width?: number;
  height?: number;
  color?: string;
  style?: StyleMap;
};

export type CrepusBadgeNode = {
  kind: "badge";
  label?: string;
  tone?: string;
  style?: StyleMap;
};

export type CrepusDividerNode = {
  kind: "divider";
  orientation?: "horizontal" | "vertical";
  style?: StyleMap;
};

export type CrepusSpacerNode = {
  kind: "spacer";
  size?: number | string;
  flex?: number | string;
  style?: StyleMap;
};

export type CrepusImageNode = {
  kind: "image";
  src?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  style?: StyleMap;
};

export type CrepusIfNode = {
  kind: "if";
  condition?: boolean;
  then?: CrepusNode | CrepusNode[];
  else?: CrepusNode | CrepusNode[];
  style?: StyleMap;
};

export type CrepusForEachNode = {
  kind: "forEach";
  items?: unknown[];
  itemTemplate?: CrepusNode;
  children?: CrepusNode[];
  style?: StyleMap;
};

export type CrepusListNode = {
  kind: "list";
  children?: CrepusNode[];
  ordered?: boolean;
  style?: StyleMap;
};

export type CrepusListItemNode = {
  kind: "listItem";
  children?: CrepusNode[];
  label?: string;
  style?: StyleMap;
};

export type CrepusUnknownNode = {
  kind: string;
  [key: string]: unknown;
};

export type CrepusNode =
  | CrepusTextNode
  | CrepusStackNode
  | CrepusScrollNode
  | CrepusButtonNode
  | CrepusToggleNode
  | CrepusCheckboxNode
  | CrepusProgressNode
  | CrepusMeterNode
  | CrepusSparklineNode
  | CrepusBadgeNode
  | CrepusDividerNode
  | CrepusSpacerNode
  | CrepusImageNode
  | CrepusIfNode
  | CrepusForEachNode
  | CrepusListNode
  | CrepusListItemNode
  | CrepusUnknownNode;

export type CrepusIr = {
  version?: number;
  root: CrepusNode[];
};

/** Emit / CLI compatibility alias for {@link CrepusIr}. */
export type ViewIr = CrepusIr;

export type RenderCrepusOptions = {
  /** Invoked when a button/toggle/checkbox handler name fires. */
  onAction?: (handler: string, payload?: unknown) => void;
  /** Optional key prefix for React reconciliation. */
  keyPrefix?: string;
};

export type { CSSProperties };
