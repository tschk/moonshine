import { useEffect, useRef } from "react";
import { BAYER, clamp01 } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";

export type GradientProps = {
  from?: DitherColor | string;
  to?: DitherColor | string;
  height?: number;
  theme?: string;
  className?: string;
};

export function Gradient({
  from = "blue",
  to = "purple",
  height = 120,
  theme = "dither-kit",
  className,
}: GradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
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
      const a = seedOfColor(from, theme);
      const b = seedOfColor(to, theme);
      // Four possible colour strings; building one per pixel is the cost.
      const aLit = rgb(a.fill, 1, 0.85);
      const aDim = rgb(a.fill, 1, 0.25);
      const bLit = rgb(b.fill, 1, 0.85);
      const bDim = rgb(b.fill, 1, 0.25);
      for (let y = 0; y < height; y++) {
        const t = y / Math.max(height - 1, 1);
        for (let x = 0; x < width; x++) {
          const mix = t + (BAYER[y & 3]![x & 3]! - 0.5) * 0.15;
          const first = mix < 0.5;
          const lit = clamp01(mix) > BAYER[y & 3]![x & 3]!;
          ctx.fillStyle = first ? (lit ? aLit : aDim) : lit ? bLit : bDim;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [from, to, height, theme]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height }}>
      <canvas
        ref={canvasRef}
        aria-hidden
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
