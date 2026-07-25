import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
};

export function Card({ title, children, style, ...rest }: CardProps) {
  return (
    <div
      data-ms="card"
      style={{
        background: "var(--ms-surface, #141418)",
        border: "1px solid var(--ms-border, #2a2a30)",
        borderRadius: 10,
        padding: 16,
        color: "var(--ms-fg, #f2f2f5)",
        ...style,
      }}
      {...rest}
    >
      {title != null ? (
        <div data-ms="card-title" style={{ fontWeight: 600, marginBottom: 8 }}>
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}
