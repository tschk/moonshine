import { useEffect, useRef } from "react";
import { BAYER, clamp01, type AreaVariant } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";

export type PieChartProps = {
  values: number[];
  colors?: Array<DitherColor | string>;
  height?: number;
  theme?: string;
  variant?: AreaVariant;
  className?: string;
};

const DEFAULT_COLORS: DitherColor[] = ["blue", "green", "orange", "pink", "purple", "red", "grey"];

export function PieChart({
  values,
  colors = DEFAULT_COLORS,
  height = 160,
  theme = "dither-kit",
  variant = "dotted",
  className,
}: PieChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !values.length) return;

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
      const total = values.reduce((a, b) => a + b, 0) || 1;
      const cx = size / 2;
      const cy = size / 2;
      const r = size / 2 - 2;
      let angle = -Math.PI / 2;
      values.forEach((v, i) => {
        const sweep = (v / total) * Math.PI * 2;
        const seed = seedOfColor(colors[i % colors.length]!, theme);
        // dithered wedge via pixel scan
        const end = angle + sweep;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const dist = Math.hypot(dx, dy);
            if (dist > r) continue;
            let a = Math.atan2(dy, dx);
            if (a < -Math.PI / 2) a += Math.PI * 2;
            // normalize into [angle, end] space
            let aa = a;
            while (aa < angle) aa += Math.PI * 2;
            if (aa > end) continue;
            const dens = dist / r;
            const lit =
              variant === "solid" || dens > BAYER[y & 3]![x & 3]! - 0.05;
            if (variant === "dotted" && !lit) continue;
            if (variant === "hatched" && ((x + y) & 3) >= 2) continue;
            const alpha = clamp01(lit ? 0.85 : 0.3);
            ctx.fillStyle = rgb(seed.fill, 1, alpha);
            ctx.fillRect(x, y, 1, 1);
          }
        }
        angle = end;
      });
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [values, colors, height, theme, variant]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height, display: "flex", justifyContent: "center" }}>
      <canvas ref={canvasRef} aria-label="pie chart" role="img" style={{ imageRendering: "pixelated" }} />
    </div>
  );
}
