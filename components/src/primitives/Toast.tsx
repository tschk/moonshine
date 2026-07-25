import type { HTMLAttributes, ReactNode } from "react";

export type ToastProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  title?: ReactNode;
  description?: ReactNode;
};

export function Toast({ open = true, title, description, style, children, ...rest }: ToastProps) {
  if (!open) return null;
  return (
    <div
      data-ms="toast"
      role="status"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        padding: "12px 14px",
        borderRadius: 10,
        background: "var(--ms-surface, #141418)",
        border: "1px solid var(--ms-border, #2a2a30)",
        color: "var(--ms-fg, #f2f2f5)",
        minWidth: 220,
        zIndex: 60,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        ...style,
      }}
      {...rest}
    >
      {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
      {description ? <div style={{ color: "var(--ms-muted, #5c5c64)", marginTop: 4 }}>{description}</div> : null}
      {children}
    </div>
  );
}
