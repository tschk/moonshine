import { BAYER, clamp01 } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";
import { DitherCanvas } from "./canvas";

export type PixelGridProps = {
  /** Density values 0–1, length = cols * rows (or 2D). */
  values: number[] | number[][];
  cols?: number;
  rows?: number;
  color?: DitherColor | string;
  height?: number;
  theme?: string;
  className?: string;
};

export function PixelGrid({
  values,
  cols: colsProp,
  rows: rowsProp,
  color = "blue",
  height = 96,
  theme = "dither-kit",
  className,
}: PixelGridProps) {
  return (
    <DitherCanvas
      height={height}
      className={className}
      label="pixel grid"
      deps={[values, colsProp, rowsProp, color, theme]}
      paint={(ctx, width, h) => {
        const flat = Array.isArray(values[0])
          ? (values as number[][]).flat()
          : (values as number[]);
        const rows =
          rowsProp ??
          (Array.isArray(values[0])
            ? (values as number[][]).length
            : Math.round(Math.sqrt(flat.length)) || 8);
        const cols =
          colsProp ??
          (Array.isArray(values[0])
            ? (values as number[][])[0]!.length
            : Math.ceil(flat.length / rows) || 8);

        ctx.clearRect(0, 0, width, h);
        const seed = seedOfColor(color, theme);
        const cellW = width / cols;
        const cellH = h / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const t = clamp01(flat[r * cols + c] ?? 0);
            const x0 = Math.floor(c * cellW);
            const y0 = Math.floor(r * cellH);
            const x1 = Math.ceil((c + 1) * cellW);
            const y1 = Math.ceil((r + 1) * cellH);
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                const lit = t > BAYER[y & 3]![x & 3]!;
                if (!lit && t < 0.05) continue;
                ctx.fillStyle = rgb(seed.fill, 1, clamp01(lit ? 0.9 : 0.25));
                ctx.fillRect(x, y, 1, 1);
              }
            }
          }
        }
      }}
    />
  );
}
