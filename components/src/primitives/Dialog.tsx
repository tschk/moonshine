import { useCallback, useRef, type HTMLAttributes, type ReactNode } from "react";
import { useOverlayFocus } from "./_focus";

export type DialogProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: ReactNode;
};

export function Dialog({ open = false, onOpenChange, title, children, style, ...rest }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpenChange?.(false), [onOpenChange]);
  useOverlayFocus(open, close, panelRef);

  if (!open) return null;
  return (
    <div
      data-ms="dialog-root"
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
      onClick={close}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        data-ms="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--ms-surface, #141418)",
          color: "var(--ms-fg, #f2f2f5)",
          border: "1px solid var(--ms-border, #2a2a30)",
          borderRadius: 12,
          padding: 20,
          minWidth: 280,
          maxWidth: "90vw",
          ...style,
        }}
        {...rest}
      >
        {title ? <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div> : null}
        {children}
      </div>
    </div>
  );
}
