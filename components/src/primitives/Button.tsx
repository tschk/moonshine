import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
};

export function Button({
  variant = "solid",
  size = "md",
  style,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const pad =
    size === "sm" ? "4px 10px" : size === "lg" ? "10px 18px" : "6px 14px";
  const bg =
    variant === "solid"
      ? "var(--ms-accent, #358ff3)"
      : variant === "outline"
        ? "transparent"
        : "transparent";
  const color = variant === "solid" ? "#fff" : "var(--ms-fg, #f2f2f5)";
  const border =
    variant === "outline"
      ? "1px solid var(--ms-border, #2a2a30)"
      : "1px solid transparent";
  return (
    <button
      type={type}
      data-ms="button"
      data-variant={variant}
      style={{
        padding: pad,
        background: bg,
        color,
        border,
        borderRadius: 6,
        cursor: "pointer",
        font: "inherit",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
