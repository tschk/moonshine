import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

export type PopoverProps = HTMLAttributes<HTMLDivElement> & {
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Popover({ trigger, open, onOpenChange, children, style, ...rest }: PopoverProps) {
  const [internal, setInternal] = useState(false);
  const isOpen = open ?? internal;
  const setOpen = (v: boolean) => {
    setInternal(v);
    onOpenChange?.(v);
  };
  return (
    <div data-ms="popover" style={{ position: "relative", display: "inline-block", ...style }} {...rest}>
      <span onClick={() => setOpen(!isOpen)} style={{ cursor: "pointer" }}>
        {trigger}
      </span>
      {isOpen ? (
        <div
          data-ms="popover-content"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            padding: 12,
            minWidth: 180,
            background: "var(--ms-surface, #141418)",
            border: "1px solid var(--ms-border, #2a2a30)",
            borderRadius: 8,
            zIndex: 20,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
