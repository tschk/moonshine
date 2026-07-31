import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

export type HoverCardProps = HTMLAttributes<HTMLDivElement> & {
  trigger: ReactNode;
};

export function HoverCard({
  trigger,
  children,
  style,
  ...rest
}: HoverCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-ms="hover-card"
      style={{ position: "relative", display: "inline-block", ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...rest}
    >
      {trigger}
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 8,
            padding: 12,
            minWidth: 200,
            background: "var(--ms-surface, #141418)",
            border: "1px solid var(--ms-border, #2a2a30)",
            borderRadius: 10,
            zIndex: 20,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
