import type { InputHTMLAttributes } from "react";

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Checkbox({ label, style, id, ...rest }: CheckboxProps) {
  const inputId = id ?? rest.name;
  return (
    <label
      data-ms="checkbox"
      htmlFor={inputId}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", ...style }}
    >
      <input id={inputId} type="checkbox" {...rest} />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
