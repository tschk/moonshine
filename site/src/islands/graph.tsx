import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
  const fill = createMemo(() => Math.min(100, Math.abs(count()) * 4));
  return { count, step, doubled, band, fill };
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
        <dd>
          <span className="track" aria-hidden="true">
            <span className="bar" style={{ width: `${fill}%` }} />
          </span>{" "}
          {fill}%
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
