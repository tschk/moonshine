import type { HTMLAttributes } from "react";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: number | string;
  height?: number | string;
};

export function Skeleton({ width = "100%", height = 16, style, ...rest }: SkeletonProps) {
  return (
    <div
      data-ms="skeleton"
      aria-hidden
      style={{
        width,
        height,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, var(--ms-border, #2a2a30) 25%, var(--ms-surface, #141418) 50%, var(--ms-border, #2a2a30) 75%)",
        backgroundSize: "200% 100%",
        animation: "ms-skeleton 1.2s ease-in-out infinite",
        ...style,
      }}
      {...rest}
    />
  );
}
