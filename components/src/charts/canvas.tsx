import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";

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

function paintCanvas(
  canvas: HTMLCanvasElement | null,
  wrap: HTMLDivElement | null,
  enabled: boolean,
  square: boolean,
  height: number,
  paint: DitherPaint,
) {
  if (!canvas || !wrap || !enabled) return;

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
  paint(ctx, width, paintHeight);
}

function useDepsRedraw(deps: readonly unknown[], draw: () => void) {
  const depsRef = useRef(deps);
  useEffect(() => {
    if (
      deps.length !== depsRef.current.length ||
      deps.some((d, i) => d !== depsRef.current[i])
    ) {
      depsRef.current = deps;
      draw();
    }
  }, [deps, draw]);
}

function useResizeRedraw(
  wrapRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  draw: () => void,
) {
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !enabled) return;

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw, enabled, wrapRef]);
}

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

  const draw = useCallback(() => {
    paintCanvas(
      canvasRef.current,
      wrapRef.current,
      enabled,
      square,
      height,
      paintRef.current,
    );
  }, [enabled, height, square]);

  useDepsRedraw(deps, draw);
  useResizeRedraw(wrapRef, enabled, draw);

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
