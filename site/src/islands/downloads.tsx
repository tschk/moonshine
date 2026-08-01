import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { DownloadPoint, DownloadSeries } from "../registry";

export const DOWNLOADS_ISLAND = "download-chart";

export type DownloadsProps = {
  /** Stable per-chart id, used to key the clip path and the props script. */
  id: string;
  series: DownloadSeries;
};

const VIEW_W = 600;
const VIEW_H = 140;
const PAD_T = 12;
const PAD_B = 20;
const PAD_X = 3;

type Geometry = {
  xs: number[];
  line: string;
  area: string;
  max: number;
  baseY: number;
};

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Catmull-Rom through every sample, converted to cubic beziers, so the curve
 * passes through the real numbers instead of approximating them. Control
 * points are clamped to the plot so a spike next to a flat run cannot bow the
 * curve below zero and imply a value that was never reported.
 */
function geometry(points: DownloadPoint[]): Geometry {
  const n = points.length;
  const baseY = VIEW_H - PAD_B;
  const max = Math.max(1, ...points.map((point) => point.downloads));
  const span = VIEW_W - PAD_X * 2;
  const xs = points.map((_, index) =>
    n === 1 ? VIEW_W / 2 : PAD_X + (index * span) / (n - 1),
  );
  const ys = points.map(
    (point) => PAD_T + (1 - point.downloads / max) * (baseY - PAD_T),
  );
  const at = (index: number): number => clamp(index, 0, n - 1);
  let line = `M ${xs[0]!.toFixed(2)} ${ys[0]!.toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const x0 = xs[at(i - 1)]!;
    const y0 = ys[at(i - 1)]!;
    const x1 = xs[i]!;
    const y1 = ys[i]!;
    const x2 = xs[i + 1]!;
    const y2 = ys[i + 1]!;
    const x3 = xs[at(i + 2)]!;
    const y3 = ys[at(i + 2)]!;
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = clamp(y1 + (y2 - y0) / 6, PAD_T, baseY);
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = clamp(y2 - (y3 - y1) / 6, PAD_T, baseY);
    line += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  const area =
    n === 0
      ? ""
      : `${line} L ${xs[n - 1]!.toFixed(2)} ${baseY} L ${xs[0]!.toFixed(2)} ${baseY} Z`;
  return { xs, line, area, max, baseY };
}

function plural(count: number): string {
  return count === 1 ? "download" : "downloads";
}

export function DownloadsUnavailable({ series }: { series: DownloadSeries }) {
  return (
    <p className="muted" data-live="true">
      {series.source} returned no download history for{" "}
      <code translate="no">{series.subject}</code> while this page was built, so
      no chart is shown — nothing here is baked into the bundle.
    </p>
  );
}

export default function Downloads({ id, series }: DownloadsProps) {
  const points = series.points;
  const geo = useMemo(() => geometry(points), [points]);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const pick = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || points.length === 0) return;
      const box = svg.getBoundingClientRect();
      if (box.width === 0) return;
      const ratio = (clientX - box.left) / box.width;
      setActive(
        clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1),
      );
    },
    [points.length],
  );

  const onPointer = useCallback(
    (event: PointerEvent<SVGSVGElement>) => pick(event.clientX),
    [pick],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      const last = points.length - 1;
      if (last < 0) return;
      const current = active ?? last;
      let next: number | null = null;
      if (event.key === "ArrowRight") next = Math.min(last, current + 1);
      else if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      else if (event.key === "Escape") {
        setActive(null);
        return;
      }
      if (next === null) return;
      event.preventDefault();
      setActive(next);
    },
    [active, points.length],
  );

  if (points.length === 0) return <DownloadsUnavailable series={series} />;

  const last = points.length - 1;
  const cursor = active === null ? last : active;
  const clipWidth = active === null ? VIEW_W : geo.xs[cursor]!;
  const point = points[cursor]!;
  const label = `${series.subject} on ${series.source}: ${series.total} ${plural(series.total)} over the last ${points.length} days, peak ${series.peak} on a single day.`;

  return (
    <figure className="dl">
      <div className="dl-head">
        <span className="dl-sub" translate="no">
          {series.subject}
        </span>
        <span
          className="dl-read"
          data-tracking={active === null ? "no" : "yes"}
        >
          <strong>{point.downloads}</strong> {plural(point.downloads)} ·{" "}
          {point.date}
        </span>
      </div>
      <svg
        ref={svgRef}
        className="dl-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--live)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--live)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <rect x="0" y="0" width={clipWidth} height={VIEW_H} />
          </clipPath>
        </defs>
        <line
          className="dl-base"
          x1="0"
          y1={geo.baseY}
          x2={VIEW_W}
          y2={geo.baseY}
        />
        <path className="dl-line dl-dim" d={geo.line} />
        <g clipPath={`url(#${id}-clip)`}>
          <path className="dl-area" d={geo.area} fill={`url(#${id}-grad)`} />
          <path className="dl-line dl-hot" d={geo.line} />
        </g>
        {active === null ? null : (
          <g className="dl-cursor">
            <line
              x1={geo.xs[cursor]}
              y1={PAD_T - 6}
              x2={geo.xs[cursor]}
              y2={geo.baseY}
            />
            <circle
              cx={geo.xs[cursor]}
              cy={PAD_T + (1 - point.downloads / geo.max) * (geo.baseY - PAD_T)}
              r="4"
            />
          </g>
        )}
      </svg>
      <figcaption className="dl-foot">
        <span>{points[0]!.date}</span>
        <span className="dl-scale">peak {geo.max}/day</span>
        <span>{points[last]!.date}</span>
      </figcaption>
      {series.total === 0 ? (
        <p className="muted dl-note">
          Every day in this window is a real zero: {series.subject} was
          published days ago and {series.source} has recorded no downloads yet.
        </p>
      ) : null}
    </figure>
  );
}
