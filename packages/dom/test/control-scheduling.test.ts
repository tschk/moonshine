import { expect, test } from "bun:test";
import { For, Show, mapArray, indexArray } from "../src/control";
import { createRoot, createSignal, onCleanup } from "../src/reactive";

test("explicit reconciliation scheduling pulls inside its caller and preserves deferred removal", () => {
  const [items, setItems] = createSignal(["a"]);
  const trace: string[] = [];
  const removals: (() => void)[] = [];
  const schedule = <T>(read: () => T): (() => T) => read;
  let mapped!: () => string[],
    indexed!: () => (() => string)[],
    forwarded!: () => string[];
  const stop = createRoot((dispose) => {
    mapped = mapArray(
      items,
      (item) => {
        trace.push(`create:${item}`);
        onCleanup(() => trace.push(`remove:${item}`));
        return item;
      },
      (remove) => removals.push(remove),
      schedule,
    );
    indexed = indexArray(items, (item) => () => item(), schedule);
    forwarded = For({ each: items, children: (item) => item }, schedule);
    return dispose;
  });
  expect(trace).toEqual([]);
  expect(mapped()).toEqual(["a"]);
  const original = forwarded();
  setItems(["b"]);
  expect(trace).toEqual(["create:a"]);
  expect(mapped()).toEqual(["b"]);
  expect(trace).toEqual(["create:a", "create:b"]);
  expect(removals).toHaveLength(1);
  removals[0]!();
  expect(trace).toEqual(["create:a", "create:b", "remove:a"]);
  expect(forwarded()).toEqual(["b"]);
  expect(forwarded()).not.toBe(original);
  expect(indexed().map((read) => read())).toEqual(["b"]);
  stop();
  expect(trace).toEqual(["create:a", "create:b", "remove:a", "remove:b"]);
});

test("explicit Show scheduling keeps branch cleanup and fallback inside the pull", () => {
  const [visible, setVisible] = createSignal(true);
  const trace: string[] = [];
  let view!: () => string | undefined;
  const stop = createRoot((dispose) => {
    view = Show(
      {
        when: visible,
        children: () => {
          trace.push("child");
          onCleanup(() => trace.push("cleanup"));
          return "shown";
        },
        fallback: () => {
          trace.push("fallback");
          return "hidden";
        },
      },
      (read) => read,
    );
    return dispose;
  });
  expect(trace).toEqual([]);
  expect(view()).toBe("shown");
  setVisible(false);
  expect(trace).toEqual(["child"]);
  expect(view()).toBe("hidden");
  expect(trace).toEqual(["child", "cleanup", "fallback"]);
  stop();
});
