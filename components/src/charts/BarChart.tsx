import { paintBars, type AreaVariant } from "../dither/dither-paint";
import { seedOfColor, type DitherColor } from "../dither/themes";
import { DitherCanvas } from "./canvas";

export type BarChartProps = {
  values: number[];
  color?: DitherColor | string;
  variant?: AreaVariant;
  height?: number;
  theme?: string;
  intensity?: number;
  className?: string;
};

export function BarChart({
  values,
  color = "green",
  variant = "hatched",
  height = 120,
  theme = "dither-kit",
  intensity = 0,
  className,
}: BarChartProps) {
  return (
    <DitherCanvas
      height={height}
      className={className}
      label="bar chart"
      enabled={values.length > 0}
      deps={[values, color, variant, theme, intensity]}
      paint={(ctx, width, h) => {
        paintBars(
          ctx,
          width,
          h,
          values,
          seedOfColor(color, theme),
          variant,
          intensity,
          false,
        );
      }}
    />
  );
}
