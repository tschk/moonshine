import { useEffect, useRef } from "react";
import { BAYER, clamp01 } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const flat = Array.isArray(values[0])
      ? (values as number[][]).flat()
      : (values as number[]);
    const rows = rowsProp ?? (Array.isArray(values[0]) ? (values as number[][]).length : Math.round(Math.sqrt(flat.length)) || 8);
    const cols = colsProp ?? (Array.isArray(values[0]) ? (values as number[][])[0]!.length : Math.ceil(flat.length / rows) || 8);

    const draw = () => {
      const width = wrap.clientWidth;
      if (width <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const seed = seedOfColor(color, theme);
      const cellW = width / cols;
      const cellH = height / rows;
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
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [values, colsProp, rowsProp, color, height, theme]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height, display: "block" }}>
      <canvas
        ref={canvasRef}
        aria-label="pixel grid"
        role="img"
        style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }}
      />
    </div>
  );
}
