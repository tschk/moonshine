import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

export type TooltipProps = HTMLAttributes<HTMLSpanElement> & {
  content: ReactNode;
};

export function Tooltip({ content, children, style, ...rest }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      data-ms="tooltip-wrap"
      style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...rest}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          data-ms="tooltip"
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: 6,
            padding: "4px 8px",
            borderRadius: 6,
            background: "var(--ms-fg, #f2f2f5)",
            color: "var(--ms-bg, #0a0a0c)",
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
