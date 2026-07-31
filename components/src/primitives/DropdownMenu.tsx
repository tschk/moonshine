import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

export type DropdownMenuItem = {
  id: string;
  label: ReactNode;
  onSelect?: () => void;
};

export type DropdownMenuProps = HTMLAttributes<HTMLDivElement> & {
  trigger: ReactNode;
  items: DropdownMenuItem[];
};

export function DropdownMenu({
  trigger,
  items,
  style,
  ...rest
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-ms="dropdown-menu"
      style={{ position: "relative", display: "inline-block", ...style }}
      {...rest}
    >
      <span onClick={() => setOpen((v) => !v)} style={{ cursor: "pointer" }}>
        {trigger}
      </span>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            minWidth: 160,
            background: "var(--ms-surface, #141418)",
            border: "1px solid var(--ms-border, #2a2a30)",
            borderRadius: 8,
            padding: 4,
            zIndex: 20,
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect?.();
                setOpen(false);
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
                borderRadius: 6,
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
