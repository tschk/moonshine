import type { CSSProperties, ReactNode } from "react";

export const msVars: CSSProperties = {
  ["--ms-bg" as string]: "var(--ms-bg, #0a0a0c)",
  ["--ms-fg" as string]: "var(--ms-fg, #f2f2f5)",
  ["--ms-muted" as string]: "var(--ms-muted, #5c5c64)",
  ["--ms-accent" as string]: "var(--ms-accent, #358ff3)",
  ["--ms-border" as string]: "var(--ms-border, #2a2a30)",
  ["--ms-surface" as string]: "var(--ms-surface, #141418)",
};

export type BaseProps = {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};
