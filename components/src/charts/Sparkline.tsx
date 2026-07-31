import { paintSparkline, type AreaVariant } from "../dither/dither-paint";
import { seedOfColor, type DitherColor } from "../dither/themes";
import { DitherCanvas } from "./canvas";

export type SparklineProps = {
  values: number[];
  color?: DitherColor | string;
  variant?: AreaVariant;
  height?: number;
  theme?: string;
  intensity?: number;
  className?: string;
};

/**
 * Canvas Bayer-dither sparkline (dither-kit paint port).
 */
export function Sparkline({
  values,
  color = "blue",
  variant = "gradient",
  height = 56,
  theme = "dither-kit",
  intensity = 0,
  className,
}: SparklineProps) {
  return (
    <DitherCanvas
      height={height}
      className={className}
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
