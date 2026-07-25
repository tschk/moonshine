import { useEffect, useRef } from "react";
import {
  paintColumn,
  resample,
  backingSize,
  type AreaVariant,
} from "../dither/dither-paint";
import { seedOfColor, type DitherColor } from "../dither/themes";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || values.length < 2) return;

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
      const seed = seedOfColor(color, theme);
      const { cols, rows } = backingSize(width, height);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = Math.max(max - min, 1e-9);
      const series = resample(values, cols).map((v) =>
        Math.round(rows - 1 - ((v - min) / span) * (rows - 1)),
      );
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);
      ctx.scale(width / cols, height / rows);
      const floor = rows - 1;
      for (let x = 0; x < cols; x++) {
        paintColumn(ctx, x, series[x]!, floor, seed, { variant, intensity });
      }
      ctx.restore();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [values, color, variant, height, theme, intensity]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height, display: "block" }}>
      <canvas
        ref={canvasRef}
        aria-label="area chart"
        role="img"
        style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }}
      />
    </div>
  );
}
