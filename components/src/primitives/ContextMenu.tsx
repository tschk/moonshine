import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

export type ContextMenuItem = {
  id: string;
  label: ReactNode;
  onSelect?: () => void;
};

export type ContextMenuProps = HTMLAttributes<HTMLDivElement> & {
  items: ContextMenuItem[];
};

export function ContextMenu({
  items,
  children,
  style,
  ...rest
}: ContextMenuProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      data-ms="context-menu"
      style={{ ...style }}
      onContextMenu={(e) => {
        e.preventDefault();
        setPos({ x: e.clientX, y: e.clientY });
      }}
      onClick={() => setPos(null)}
      {...rest}
    >
      {children}
      {pos ? (
        <div
          role="menu"
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            minWidth: 160,
            background: "var(--ms-surface, #141418)",
            border: "1px solid var(--ms-border, #2a2a30)",
            borderRadius: 8,
            padding: 4,
            zIndex: 70,
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect?.();
                setPos(null);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                color: "var(--ms-fg, #f2f2f5)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
