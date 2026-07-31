import type { HTMLAttributes } from "react";

export type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value?: number;
  max?: number;
};

export function Progress({
  value = 0,
  max = 1,
  style,
  ...rest
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div
      data-ms="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      style={{
        height: 8,
        borderRadius: 999,
        background: "var(--ms-border, #2a2a30)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "var(--ms-accent, #358ff3)",
        }}
      />
    </div>
  );
}
