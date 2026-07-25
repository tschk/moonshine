import type { ButtonHTMLAttributes } from "react";

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ checked = false, onCheckedChange, style, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-ms="switch"
      onClick={(e) => {
        rest.onClick?.(e);
        onCheckedChange?.(!checked);
      }}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: "none",
        padding: 2,
        background: checked ? "var(--ms-accent, #358ff3)" : "var(--ms-border, #2a2a30)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          display: "block",
        }}
      />
    </button>
  );
}
