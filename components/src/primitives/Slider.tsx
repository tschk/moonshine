import type { InputHTMLAttributes } from "react";

export type SliderProps = InputHTMLAttributes<HTMLInputElement>;

export function Slider({ style, ...rest }: SliderProps) {
  return (
    <input
      type="range"
      data-ms="slider"
      style={{
        width: "100%",
        accentColor: "var(--ms-accent, #358ff3)",
        ...style,
      }}
      {...rest}
    />
  );
}
