import { useEffect, useRef } from "react";
import {
  paintColumn,
  backingSize,
  type AreaVariant,
} from "../dither/dither-paint";
import { seedOfColor, type DitherColor } from "../dither/themes";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !values.length) return;

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
      const max = Math.max(...values, 1e-9);
      const barW = Math.max(1, Math.floor(cols / values.length));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);
      ctx.scale(width / cols, height / rows);
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
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [values, color, variant, height, theme, intensity]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ width: "100%", height, display: "block" }}
    >
      <canvas
        ref={canvasRef}
        aria-label="spark bars"
        role="img"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
