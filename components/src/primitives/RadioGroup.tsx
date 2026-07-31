import type { HTMLAttributes } from "react";

export type RadioOption = { value: string; label: string };

export type RadioGroupProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  options: RadioOption[];
  value?: string;
  onValueChange?: (value: string) => void;
};

export function RadioGroup({
  name,
  options,
  value,
  onValueChange,
  style,
  ...rest
}: RadioGroupProps) {
  return (
    <div
      data-ms="radio-group"
      role="radiogroup"
      style={{ display: "grid", gap: 8, ...style }}
      {...rest}
    >
      {options.map((o) => (
        <label
          key={o.value}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onValueChange?.(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
