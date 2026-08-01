import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  batch,
  createMemo,
  createSignal,
  type Memo,
  type Signal,
} from "@tschk/moonshine";

export const ISLAND_ID = "signal-graph";

export type GraphProps = {
  /** Server-chosen starting value, so the island proves it was seeded by SSR. */
  seed: number;
};

type Graph = {
  count: Signal<number>;
  step: Signal<number>;
  doubled: Memo<number>;
  band: Memo<string>;
  fill: Memo<number>;
};

function createGraph(seed: number): Graph {
  const count = createSignal(seed);
  const step = createSignal(1);
  const doubled = createMemo(() => count() * 2);
  const band = createMemo(() => {
    const value = doubled();
    if (value < 20) return "low";
    if (value < 60) return "mid";
    return "high";
  });
  const fill = createMemo(() => Math.abs(count()) * 4);
  return { count, step, doubled, band, fill };
}

const PARTICLE_COUNT = 26;
const PARTICLE_COLORS = ["#a3e635", "#e4e4e7", "#65a30d", "#fafafa"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  life: number;
  color: string;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Confetti fires on the crossing of 100%, not on every render above it, so the
 * `wasOver` ref is the whole state machine. The canvas is sized to its own box
 * and cleared when the burst ends, and the frame handle is cancelled on
 * unmount, so nothing keeps running once the animation is over.
 */
function useConfetti(
  fill: number,
): [
  React.RefObject<HTMLCanvasElement | null>,
  React.RefObject<HTMLSpanElement | null>,
] {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const wasOver = useRef<boolean | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const over = fill > 100;
    const previous = wasOver.current;
    wasOver.current = over;
    if (previous !== false || !over) return;
    if (prefersReducedMotion()) return;

    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;
    canvas.style.display = "block";
    const box = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (box.width === 0 || box.height === 0 || !context) {
      canvas.style.display = "";
      return;
    }

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const trackBox = track.getBoundingClientRect();
    const originX = trackBox.right - box.left;
    const originY = trackBox.top + trackBox.height / 2 - box.top;

    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 2.4 + Math.random() * 3.4;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed + 1.1,
        vy: Math.sin(angle) * speed,
        w: 2 + Math.random() * 3,
        h: 4 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        life: 1,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]!,
      });
    }

    const step = () => {
      context.clearRect(0, 0, box.width, box.height);
      let alive = 0;
      for (const particle of particles) {
        particle.life -= 0.016;
        if (particle.life <= 0) continue;
        alive += 1;
        particle.vy += 0.16;
        particle.vx *= 0.99;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rot += particle.vr;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rot);
        context.globalAlpha = Math.min(1, particle.life);
        context.fillStyle = particle.color;
        context.fillRect(
          -particle.w / 2,
          -particle.h / 2,
          particle.w,
          particle.h,
        );
        context.restore();
      }
      if (alive === 0) {
        context.clearRect(0, 0, box.width, box.height);
        canvas.style.display = "";
        frameRef.current = null;
        return;
      }
      frameRef.current = requestAnimationFrame(step);
    };
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(step);
  }, [fill]);

  return [canvasRef, trackRef];
}

type Readable<T> = {
  (): T;
  peek: () => T;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Bridges a moonshine signal into React without pulling in the React adapter:
 * the whole contract is `call to read`, `subscribe to be told`.
 */
function useSignalValue<T>(source: Readable<T>): T {
  const subscribe = useCallback(
    (onChange: () => void) => source.subscribe(onChange),
    [source],
  );
  const read = useCallback(() => source(), [source]);
  const peek = useCallback(() => source.peek(), [source]);
  return useSyncExternalStore(subscribe, read, peek);
}

export default function SignalGraph({ seed }: GraphProps) {
  const [graph] = useState(() => createGraph(seed));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  const count = useSignalValue(graph.count);
  const step = useSignalValue(graph.step);
  const doubled = useSignalValue(graph.doubled);
  const band = useSignalValue(graph.band);
  const fill = useSignalValue(graph.fill);
  const [confettiRef, trackRef] = useConfetti(fill);

  return (
    <div className="island-body">
      <dl className="graph">
        <dt>count</dt>
        <dd>
          <output>{count}</output>
        </dd>
        <dt>step</dt>
        <dd>{step}</dd>
        <dt>doubled</dt>
        <dd>{doubled}</dd>
        <dt>band</dt>
        <dd>{band}</dd>
        <dt>fill</dt>
        <dd className="fillcell">
          <canvas className="confetti" aria-hidden="true" ref={confettiRef} />
          <span
            className="track"
            aria-hidden="true"
            data-over={fill > 100 ? "true" : "false"}
            ref={trackRef}
          >
            <span
              className="bar"
              style={{ "--fill": Math.min(1, fill / 100) } as CSSProperties}
            />
          </span>{" "}
          <span className="fillnum" data-over={fill > 100 ? "true" : "false"}>
            {fill}%
          </span>
        </dd>
      </dl>
      <div className="controls">
        <button
          type="button"
          onClick={() => graph.count.set((value) => value + graph.step.peek())}
          disabled={!hydrated}
        >
          count += step
        </button>
        <button
          type="button"
          onClick={() => graph.step.set((value) => value * 2)}
          disabled={!hydrated}
        >
          double step
        </button>
        <button
          type="button"
          onClick={() =>
            batch(() => {
              graph.count.set(seed);
              graph.step.set(1);
            })
          }
          disabled={!hydrated}
        >
          reset to seed
        </button>
      </div>
      <p className="status" data-hydrated={hydrated ? "true" : "false"}>
        {hydrated
          ? "hydrated — two memos and one derived width recompute from the signal graph, no framework re-render loop"
          : "server-rendered from the same signal graph — hydrating"}
      </p>
    </div>
  );
}
