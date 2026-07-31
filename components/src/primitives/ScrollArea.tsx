import type { HTMLAttributes } from "react";

export type ScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  maxHeight?: number | string;
};

export function ScrollArea({
  maxHeight = 240,
  style,
  children,
  ...rest
}: ScrollAreaProps) {
  return (
    <div
      data-ms="scroll-area"
      style={{ overflow: "auto", maxHeight, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
