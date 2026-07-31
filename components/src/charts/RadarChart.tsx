import { useEffect, useRef } from "react";
import { BAYER, clamp01 } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || values.length < 3) return;

    const draw = () => {
      const width = wrap.clientWidth;
      if (width <= 0) return;
      const size = Math.min(width, height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(size * dpr));
      canvas.height = Math.max(1, Math.floor(size * dpr));
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!pointInPoly(x + 0.5, y + 0.5, pts)) continue;
          const lit = BAYER[y & 3]![x & 3]! < 0.55;
          ctx.fillStyle = rgb(seed.fill, 1, clamp01(lit ? 0.8 : 0.25));
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
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [values, max, color, height, theme]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        width: "100%",
        height,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="radar chart"
        role="img"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
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
