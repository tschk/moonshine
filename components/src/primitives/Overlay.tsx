import { useCallback, useRef, type HTMLAttributes } from "react";
import { useOverlayFocus } from "./_focus";

export type OverlayProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  panelProps?: HTMLAttributes<HTMLDivElement>;
  containerProps?: HTMLAttributes<HTMLDivElement>;
};

export function Overlay({
  open = false,
  onOpenChange,
  panelProps,
  containerProps,
  children,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpenChange?.(false), [onOpenChange]);
  useOverlayFocus(open, close, panelRef);

  if (!open) return null;

  return (
    <div
      role="presentation"
      {...containerProps}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        ...containerProps?.style,
      }}
      onClick={(e) => {
        close();
        containerProps?.onClick?.(e);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        {...panelProps}
        onClick={(e) => {
          e.stopPropagation();
          panelProps?.onClick?.(e);
        }}
        style={{
          background: "var(--ms-surface, #141418)",
          color: "var(--ms-fg, #f2f2f5)",
          border: "1px solid var(--ms-border, #2a2a30)",
          ...panelProps?.style,
        }}
      >
        {children}
      </div>
    </div>
  );
}
