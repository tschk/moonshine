import { useCallback, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { useOverlayFocus } from "./_focus";

export type PopoverProps = HTMLAttributes<HTMLDivElement> & {
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Popover({ trigger, open, onOpenChange, children, style, ...rest }: PopoverProps) {
  const [internal, setInternal] = useState(false);
  const isOpen = open ?? internal;
  const setOpen = useCallback(
    (v: boolean) => {
      setInternal(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useOverlayFocus(isOpen, close, contentRef);

  return (
    <div data-ms="popover" style={{ position: "relative", display: "inline-block", ...style }} {...rest}>
      <span onClick={() => setOpen(!isOpen)} style={{ cursor: "pointer" }}>
        {trigger}
      </span>
      {isOpen ? (
        <div
          ref={contentRef}
          data-ms="popover-content"
          role="dialog"
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
