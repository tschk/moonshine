import type { HTMLAttributes } from "react";

export type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
};

export function Separator({
  orientation = "horizontal",
  style,
  ...rest
}: SeparatorProps) {
  const vertical = orientation === "vertical";
  return (
    <div
      data-ms="separator"
      role="separator"
      aria-orientation={orientation}
      style={
        vertical
          ? {
              width: 1,
              alignSelf: "stretch",
              background: "var(--ms-border, #2a2a30)",
              ...style,
            }
          : {
              height: 1,
              width: "100%",
              background: "var(--ms-border, #2a2a30)",
              ...style,
            }
      }
      {...rest}
    />
  );
}
