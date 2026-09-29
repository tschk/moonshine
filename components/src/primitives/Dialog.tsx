import { type HTMLAttributes, type ReactNode } from "react";
import { Overlay } from "./Overlay";

export type DialogProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: ReactNode;
};

export function Dialog({
  open = false,
  onOpenChange,
  title,
  children,
  style,
  ...rest
}: DialogProps) {
  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      containerProps={{
        "data-ms": "dialog-root",
        style: {
          background: "rgba(0,0,0,0.5)",
          display: "grid",
          placeItems: "center",
        },
      }}
      panelProps={{
        "data-ms": "dialog",
        style: {
          borderRadius: 12,
          padding: 20,
          minWidth: 280,
          maxWidth: "90vw",
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
