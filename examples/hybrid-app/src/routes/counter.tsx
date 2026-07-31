import { island } from "@tschk/moonshine/react";

const CounterIsland = island(() => import("../components/Counter"));

export default function CounterPage() {
  return (
    <div>
      <h1>counter</h1>
      <CounterIsland />
    </div>
  );
}
