import { useEffect, useRef } from "react";
import { clamp01 } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";

export type LightRaysProps = {
  color?: DitherColor | string;
  height?: number;
  theme?: string;
  rays?: number;
  className?: string;
};

export function LightRays({
  color = "blue",
  height = 180,
  theme = "dither-kit",
  rays = 12,
  className,
}: LightRaysProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let raf = 0;
    const seed = seedOfColor(color, theme);
    const start = performance.now();

    const frame = (now: number) => {
      const width = wrap.clientWidth;
      if (width > 0) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);
          const t = (now - start) / 1000;
          const cx = width / 2;
          const cy = height * 0.15;
          for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI + Math.sin(t + i) * 0.08;
            const len = height * 1.2;
            ctx.strokeStyle = rgb(
              seed.fill,
              1,
              clamp01(0.15 + 0.1 * Math.sin(t * 2 + i)),
            );
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [color, height, theme, rays]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height }}>
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
