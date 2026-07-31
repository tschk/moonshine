import { BAYER, clamp01 } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";
import { DitherCanvas } from "./canvas";

export type HeatmapProps = {
  /** Row-major matrix of intensities 0–1 (or any scale; auto-normalized). */
  data: number[][];
  color?: DitherColor | string;
  height?: number;
  theme?: string;
  className?: string;
};

export function Heatmap({
  data,
  color = "red",
  height = 120,
  theme = "dither-kit",
  className,
}: HeatmapProps) {
  return (
    <DitherCanvas
      height={height}
      className={className}
      label="heatmap"
      enabled={data.length > 0}
      deps={[data, color, theme]}
      paint={(ctx, width, h) => {
        ctx.clearRect(0, 0, width, h);
        const seed = seedOfColor(color, theme);
        const rows = data.length;
        const cols = Math.max(...data.map((r) => r.length), 1);
        const flat = data.flat();
        const min = Math.min(...flat);
        const max = Math.max(...flat);
        const span = Math.max(max - min, 1e-9);
        const cellW = width / cols;
        const cellH = h / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < (data[r]?.length ?? 0); c++) {
            const t = ((data[r]![c] ?? 0) - min) / span;
            const x0 = Math.floor(c * cellW);
            const y0 = Math.floor(r * cellH);
            const x1 = Math.floor((c + 1) * cellW);
            const y1 = Math.floor((r + 1) * cellH);
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                const lit = t > BAYER[y & 3]![x & 3]!;
                ctx.fillStyle = rgb(
                  seed.fill,
                  1,
                  clamp01(lit ? 0.35 + t * 0.65 : t * 0.2),
                );
                ctx.fillRect(x, y, 1, 1);
              }
            }
          }
        }
      }}
    />
  );
}
