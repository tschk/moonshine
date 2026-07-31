import {
  paintColumn,
  backingSize,
  type AreaVariant,
} from "../dither/dither-paint";
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
          const x = Math.min(i * barW, cols - 1);
          paintColumn(ctx, x, top, floor, seed, {
            variant,
            intensity,
            sparse: 0.05,
          });
        });
        ctx.restore();
      }}
    />
  );
}
