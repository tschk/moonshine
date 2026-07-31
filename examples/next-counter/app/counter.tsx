"use client";

import { createSignal, useSignal } from "@tschk/moonshine-next";

const count = createSignal(0);

export function Counter() {
  const n = useSignal(count);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span>count: {n}</span>
      <button type="button" onClick={() => count.set((c) => c + 1)}>
        +1
      </button>
      <button type="button" onClick={() => count.set(0)}>
        reset
      </button>
    </div>
  );
}
