import type { HTMLAttributes, ReactNode } from "react";

export type SheetProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "left" | "right" | "bottom" | "top";
  title?: ReactNode;
};

export function Sheet({
  open = false,
  onOpenChange,
  side = "right",
  title,
  children,
  style,
  ...rest
}: SheetProps) {
  if (!open) return null;
  const pos: Record<string, unknown> =
    side === "left"
      ? { left: 0, top: 0, bottom: 0, width: 320 }
      : side === "right"
        ? { right: 0, top: 0, bottom: 0, width: 320 }
        : side === "top"
          ? { top: 0, left: 0, right: 0, height: 240 }
          : { bottom: 0, left: 0, right: 0, height: 240 };
  return (
    <div
      data-ms="sheet-root"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50 }}
      onClick={() => onOpenChange?.(false)}
    >
      <div
        data-ms="sheet"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          background: "var(--ms-surface, #141418)",
          color: "var(--ms-fg, #f2f2f5)",
          border: "1px solid var(--ms-border, #2a2a30)",
          padding: 20,
          ...pos,
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
