import type { HTMLAttributes, ReactNode } from "react";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, action, style, children, ...rest }: EmptyStateProps) {
  return (
    <div
      data-ms="empty-state"
      style={{
        textAlign: "center",
        padding: 32,
        color: "var(--ms-muted, #5c5c64)",
        ...style,
      }}
      {...rest}
    >
      {title ? <div style={{ color: "var(--ms-fg, #f2f2f5)", fontWeight: 600, marginBottom: 8 }}>{title}</div> : null}
      {description ? <div style={{ marginBottom: 16 }}>{description}</div> : null}
      {action}
      {children}
    </div>
  );
}
