import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

export type TabItem = { id: string; label: ReactNode; content: ReactNode };

export type TabsProps = HTMLAttributes<HTMLDivElement> & {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
};

export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  style,
  ...rest
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.id ?? "");
  const active = value ?? internal;
  return (
    <div data-ms="tabs" style={style} {...rest}>
      <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--ms-border, #2a2a30)" }}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            onClick={() => {
              setInternal(item.id);
              onValueChange?.(item.id);
            }}
            style={{
              padding: "8px 12px",
              background: "transparent",
              border: "none",
              borderBottom: active === item.id ? "2px solid var(--ms-accent, #358ff3)" : "2px solid transparent",
              color: "var(--ms-fg, #f2f2f5)",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) =>
        active === item.id ? (
          <div key={item.id} role="tabpanel" data-ms="tab-panel" style={{ paddingTop: 12 }}>
            {item.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
