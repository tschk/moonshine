import type { HTMLAttributes } from "react";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "accent" | "muted" | "danger" | "success";
};

export function Badge({
  tone = "accent",
  style,
  children,
  ...rest
}: BadgeProps) {
  const bg =
    tone === "muted"
      ? "var(--ms-muted, #5c5c64)"
      : tone === "danger"
        ? "#e11d48"
        : tone === "success"
          ? "#16a34a"
          : "var(--ms-accent, #358ff3)";
  return (
    <span
      data-ms="badge"
      data-tone={tone}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        lineHeight: 1.4,
        background: bg,
        color: "#fff",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
