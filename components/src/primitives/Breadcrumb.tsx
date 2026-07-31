import type { HTMLAttributes, ReactNode } from "react";

export type BreadcrumbItem = { id: string; label: ReactNode; href?: string };

export type BreadcrumbProps = HTMLAttributes<HTMLElement> & {
  items: BreadcrumbItem[];
};

export function Breadcrumb({ items, style, ...rest }: BreadcrumbProps) {
  return (
    <nav data-ms="breadcrumb" aria-label="Breadcrumb" style={style} {...rest}>
      <ol
        style={{
          display: "flex",
          gap: 8,
          listStyle: "none",
          margin: 0,
          padding: 0,
          flexWrap: "wrap",
        }}
      >
        {items.map((item, i) => (
          <li
            key={item.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {item.href ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span>{item.label}</span>
            )}
            {i < items.length - 1 ? (
              <span aria-hidden style={{ color: "var(--ms-muted, #5c5c64)" }}>
                /
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
