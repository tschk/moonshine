import {
  paintColumn,
  resample,
  backingSize,
  type AreaVariant,
} from "../dither/dither-paint";
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
        const seed = seedOfColor(color, theme);
        const { cols, rows } = backingSize(width, h);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = Math.max(max - min, 1e-9);
        const series = resample(values, cols).map((v) =>
          Math.round(rows - 1 - ((v - min) / span) * (rows - 1)),
        );
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, width, h);
        ctx.scale(width / cols, h / rows);
        const floor = rows - 1;
        for (let x = 0; x < cols; x++) {
          paintColumn(ctx, x, series[x]!, floor, seed, { variant, intensity });
        }
        ctx.restore();
      }}
    />
  );
}
