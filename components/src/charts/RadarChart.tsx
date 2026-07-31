import { BAYER } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";
import { DitherCanvas } from "./canvas";

export type RadarChartProps = {
  values: number[];
  max?: number;
  color?: DitherColor | string;
  height?: number;
  theme?: string;
  className?: string;
};

export function RadarChart({
  values,
  max,
  color = "purple",
  height = 180,
  theme = "dither-kit",
  className,
}: RadarChartProps) {
  return (
    <DitherCanvas
      height={height}
      className={className}
      label="radar chart"
      square
      enabled={values.length >= 3}
      deps={[values, max, color, theme]}
      paint={(ctx, size) => {
        ctx.clearRect(0, 0, size, size);
        const seed = seedOfColor(color, theme);
        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 8;
        const m = max ?? Math.max(...values, 1);
        const n = values.length;
        const pts = values.map((v, i) => {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const rr = (v / m) * r;
          return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
        });
        // Two alphas only; building the colour string per pixel is the cost.
        const litStyle = rgb(seed.fill, 1, 0.8);
        const dimStyle = rgb(seed.fill, 1, 0.25);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (!pointInPoly(x + 0.5, y + 0.5, pts)) continue;
            const lit = BAYER[y & 3]![x & 3]! < 0.55;
            ctx.fillStyle = lit ? litStyle : dimStyle;
            ctx.fillRect(x, y, 1, 1);
          }
        }
        ctx.strokeStyle = rgb(seed.line, 1, 0.9);
        ctx.beginPath();
        pts.forEach(([x, y], i) =>
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
        );
        ctx.closePath();
        ctx.stroke();
      }}
    />
  );
}

function pointInPoly(
  x: number,
  y: number,
  pts: ReadonlyArray<readonly [number, number]>,
) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]![0];
    const yi = pts[i]![1];
    const xj = pts[j]![0];
    const yj = pts[j]![1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
