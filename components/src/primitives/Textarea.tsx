import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ style, ...rest }: TextareaProps) {
  return (
    <textarea
      data-ms="textarea"
      style={{
        width: "100%",
        minHeight: 80,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--ms-border, #2a2a30)",
        background: "var(--ms-bg, #0a0a0c)",
        color: "var(--ms-fg, #f2f2f5)",
        font: "inherit",
        resize: "vertical",
        ...style,
      }}
      {...rest}
    />
  );
}
