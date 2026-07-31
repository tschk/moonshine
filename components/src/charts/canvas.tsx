import { useEffect, useRef, type ReactNode } from "react";

/** Paints one frame into a canvas already scaled to CSS pixels. */
export type DitherPaint = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void;

export type DitherCanvasProps = {
  paint: DitherPaint;
  /** Values the paint closes over; repaints when any of them change. */
  deps: readonly unknown[];
  height: number;
  className?: string;
  /** Skips painting entirely, for charts that need a minimum sample count. */
  enabled?: boolean;
  /** Accessible name; omitted charts render a decorative canvas instead. */
  label?: string;
  /** Constrains the canvas to a centred square of min(width, height). */
  square?: boolean;
};

/**
 * Owns the device-pixel-ratio sizing and resize handling every dither chart
 * needs, so each chart only supplies its paint body.
 */
export function DitherCanvas({
  paint,
  deps,
  height,
  className,
  enabled = true,
  label,
  square = false,
}: DitherCanvasProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !enabled) return;

    const draw = () => {
      const clientWidth = wrap.clientWidth;
      if (clientWidth <= 0) return;
      const width = square ? Math.min(clientWidth, height) : clientWidth;
      const paintHeight = square ? width : height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(paintHeight * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${paintHeight}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintRef.current(ctx, width, paintHeight);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, enabled, square, ...deps]);

  const a11y =
    label === undefined
      ? ({ "aria-hidden": true } as const)
      : ({ "aria-label": label, role: "img" } as const);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={
        square
          ? { width: "100%", height, display: "flex", justifyContent: "center" }
          : { width: "100%", height, display: "block" }
      }
    >
      <canvas
        ref={canvasRef}
        {...a11y}
        style={
          square
            ? { imageRendering: "pixelated" }
            : {
                display: "block",
                width: "100%",
                height: "100%",
                imageRendering: "pixelated",
              }
        }
      />
    </div>
  );
}
