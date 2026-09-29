import { paintBars, type AreaVariant } from "../dither/dither-paint";
import { seedOfColor, type DitherColor } from "../dither/themes";
import { DitherCanvas } from "./canvas";

export type SparkBarsProps = {
  values: number[];
  color?: DitherColor | string;
  variant?: AreaVariant;
  height?: number;
  theme?: string;
  intensity?: number;
  className?: string;
};

export function SparkBars({
  values,
  color = "orange",
  variant = "gradient",
  height = 40,
  theme = "dither-kit",
  intensity = 0,
  className,
}: SparkBarsProps) {
  return (
    <DitherCanvas
      height={height}
      className={className}
      label="spark bars"
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
          true,
        );
      }}
    />
  );
}
