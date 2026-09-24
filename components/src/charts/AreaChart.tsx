import { paintSparkline, type AreaVariant } from "../dither/dither-paint";
import { seedOfColor, type DitherColor } from "../dither/themes";
import { DitherCanvas } from "./canvas";

export type AreaChartProps = {
  values: number[];
  color?: DitherColor | string;
  variant?: AreaVariant;
  height?: number;
  theme?: string;
  intensity?: number;
  className?: string;
};

export function AreaChart({
  values,
  color = "blue",
  variant = "gradient",
  height = 120,
  theme = "dither-kit",
  intensity = 0,
  className,
}: AreaChartProps) {
  return (
    <DitherCanvas
      height={height}
      className={className}
      label="area chart"
      enabled={values.length >= 2}
      deps={[values, color, variant, theme, intensity]}
      paint={(ctx, width, h) => {
        paintSparkline(
          ctx,
          width,
          h,
          values,
          seedOfColor(color, theme),
          variant,
          intensity,
        );
      }}
    />
  );
}
