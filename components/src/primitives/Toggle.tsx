import type { ButtonHTMLAttributes } from "react";

export type ToggleProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> & {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
};

export function Toggle({
  pressed = false,
  onPressedChange,
  children,
  style,
  ...rest
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      data-ms="toggle"
      data-state={pressed ? "on" : "off"}
      onClick={(e) => {
        rest.onClick?.(e);
        onPressedChange?.(!pressed);
      }}
      style={{
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid var(--ms-border, #2a2a30)",
        background: pressed
          ? "var(--ms-accent, #358ff3)"
          : "var(--ms-surface, #141418)",
        color: pressed ? "#fff" : "var(--ms-fg, #f2f2f5)",
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
