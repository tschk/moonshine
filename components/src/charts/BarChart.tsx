import {
  paintColumn,
  backingSize,
  type AreaVariant,
} from "../dither/dither-paint";
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
        const seed = seedOfColor(color, theme);
        const { cols, rows } = backingSize(width, h);
        const max = Math.max(...values, 1e-9);
        const barW = Math.max(1, Math.floor(cols / values.length));
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, width, h);
        ctx.scale(width / cols, h / rows);
        const floor = rows - 1;
        values.forEach((v, i) => {
          const top = Math.round(rows - 1 - (v / max) * (rows - 1));
          const x0 = i * barW;
          for (
            let x = x0;
            x < Math.min(x0 + Math.max(1, barW - 1), cols);
            x++
          ) {
            paintColumn(ctx, x, top, floor, seed, { variant, intensity });
          }
        });
        ctx.restore();
      }}
    />
  );
}
