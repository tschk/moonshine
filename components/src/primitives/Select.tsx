import type { SelectHTMLAttributes } from "react";

export type SelectOption = { value: string; label: string };

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[];
};

export function Select({ options, style, ...rest }: SelectProps) {
  return (
    <select
      data-ms="select"
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--ms-border, #2a2a30)",
        background: "var(--ms-bg, #0a0a0c)",
        color: "var(--ms-fg, #f2f2f5)",
        font: "inherit",
        ...style,
      }}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
