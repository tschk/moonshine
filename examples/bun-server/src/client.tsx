import { createApp, createSignal, useSignal } from "@tschk/moonshine/react";

const count = createSignal(0);

function Counter() {
  const n = useSignal(count);
  return (
    <div className="card">
      <p>
        hydrated counter: <strong>{n}</strong>
      </p>
      <button type="button" onClick={() => count.set((c) => c + 1)}>
        +1
      </button>
      <button type="button" onClick={() => count.set(0)}>
        reset
      </button>
    </div>
  );
}

createApp({ root: Counter }).mount("#counter");
