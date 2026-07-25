import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, ...rest }: InputProps) {
  return (
    <input
      data-ms="input"
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--ms-border, #2a2a30)",
        background: "var(--ms-bg, #0a0a0c)",
        color: "var(--ms-fg, #f2f2f5)",
        font: "inherit",
        ...style,
      }}
      {...rest}
    />
  );
}
