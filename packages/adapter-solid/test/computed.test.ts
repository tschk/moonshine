import { expect, test } from "bun:test";
import { createComputed, createSignal, onCleanup, batch } from "../src/solid";
import { createRoot } from "../src/cleanup-policy";

test("Solid computed runs immediately, retains its value and disposes tracking", () => {
  const trace: string[] = [];
  let update!: (value: number) => number;
  const dispose = createRoot((stop) => {
    const [count, setCount] = createSignal(1);
    update = setCount;
    createComputed((previous) => {
      const value = count();
      trace.push(`${previous}:${value}`);
      onCleanup(() => trace.push(`cleanup:${value}`));
      return previous + value;
    }, 0);
    expect(trace).toEqual(["0:1"]);
    return stop;
  });
  update(2);
  expect(trace).toEqual(["0:1", "cleanup:1", "1:2"]);
  batch(() => {
    update(3);
    update(4);
  });
  expect(trace.slice(-2)).toEqual(["cleanup:2", "3:4"]);
  dispose();
  update(5);
  expect(trace.at(-1)).toBe("cleanup:4");
});
