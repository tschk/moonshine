import type { HTMLAttributes } from "react";

export type MeterProps = HTMLAttributes<HTMLMeterElement> & {
  value?: number;
  min?: number;
  max?: number;
  low?: number;
  high?: number;
  optimum?: number;
};

export function Meter({
  value = 0,
  min = 0,
  max = 1,
  low,
  high,
  optimum,
  style,
  ...rest
}: MeterProps) {
  return (
    <meter
      data-ms="meter"
      value={value}
      min={min}
      max={max}
      low={low}
      high={high}
      optimum={optimum}
      style={{ width: "100%", ...style }}
      {...rest}
    />
  );
}
