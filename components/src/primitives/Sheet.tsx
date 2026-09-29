import { type HTMLAttributes, type ReactNode } from "react";
import { Overlay } from "./Overlay";

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
  const pos: Record<string, unknown> =
    side === "left"
      ? { left: 0, top: 0, bottom: 0, width: 320 }
      : side === "right"
        ? { right: 0, top: 0, bottom: 0, width: 320 }
        : side === "top"
          ? { top: 0, left: 0, right: 0, height: 240 }
          : { bottom: 0, left: 0, right: 0, height: 240 };
  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      containerProps={{
        "data-ms": "sheet-root",
        style: {
          background: "rgba(0,0,0,0.45)",
        },
      }}
      panelProps={{
        "data-ms": "sheet",
        style: {
          position: "absolute",
          padding: 20,
          ...pos,
          ...style,
        },
        ...rest,
      }}
    >
      {title ? (
        <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div>
      ) : null}
      {children}
    </Overlay>
  );
}
