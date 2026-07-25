import { useEffect, useRef } from "react";
import { BAYER } from "../dither/dither-paint";
import { seedOfColor, rgb, type DitherColor } from "../dither/themes";

export type AnimatedGradientProps = {
  colors?: Array<DitherColor | string>;
  height?: number;
  theme?: string;
  speed?: number;
  className?: string;
};

export function AnimatedGradient({
  colors = ["blue", "purple", "pink"],
  height = 140,
  theme = "dither-kit",
  speed = 0.4,
  className,
}: AnimatedGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let raf = 0;
    let start = performance.now();
    const seeds = colors.map((c) => seedOfColor(c, theme));

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
          const t = ((now - start) / 1000) * speed;
          for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
              const wave = 0.5 + 0.5 * Math.sin(x * 0.02 + y * 0.03 + t * Math.PI * 2);
              const idx = Math.floor(wave * (seeds.length - 1e-6));
              const lit = wave > BAYER[y & 3]![x & 3]!;
              ctx.fillStyle = rgb(seeds[idx]!.fill, 1, lit ? 0.9 : 0.3);
              ctx.fillRect(x, y, 2, 2);
            }
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [colors, height, theme, speed]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height }}>
      <canvas ref={canvasRef} aria-hidden style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }} />
    </div>
  );
}
