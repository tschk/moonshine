import { createSignal, useSignal } from "@tschk/moonshine/react";

const count = createSignal(0);

export default function Counter() {
  const value = useSignal(count);
  return <button onClick={() => count.set(value + 1)}>{value}</button>;
}
