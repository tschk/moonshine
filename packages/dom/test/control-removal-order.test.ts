import { expect, test } from "bun:test";
import { mapArray } from "../src/control";
import { createRoot, createSignal, onCleanup } from "../src/reactive";

for (const order of ["after-map", "before-map"] as const) {
  test(`keyed removal ${order} retains duplicate identity and live indexes`, () => {
    const [items, setItems] = createSignal([1, 1, 2]);
    const trace: string[] = [];
    let serial = 0;
    const stop = createRoot((dispose) => {
      const mapped = mapArray(
        items,
        (item, index) => {
          const id = `${item}/${++serial}`;
          trace.push(`setup:${id}`);
          onCleanup(() => trace.push(`cleanup:${id}`));
          return { id, index };
        },
        undefined,
        undefined,
        order,
      );
      const original = mapped();
      trace.length = 0;
      setItems([2, 1, 3]);
      expect(mapped()[0]).toBe(original[2]);
      expect(mapped()[1]).toBe(original[0]);
      expect(mapped().map((row) => row.index())).toEqual([0, 1, 2]);
      expect(trace).toEqual(
        order === "before-map"
          ? ["cleanup:1/2", "setup:3/4"]
          : ["setup:3/4", "cleanup:1/2"],
      );
      return dispose;
    });
    stop();
  });
}

test("early removal drains failures and never reuses disposed entries", () => {
  const [items, setItems] = createSignal([1, 2]);
  const trace: string[] = [];
  let fail = true;
  const stop = createRoot((dispose) => {
    const mapped = mapArray(
      items,
      (item) => {
        trace.push(`setup:${item}`);
        onCleanup(() => {
          trace.push(`cleanup:${item}`);
          if (fail && item === 1) throw Error("cleanup");
        });
        return { item };
      },
      undefined,
      undefined,
      "before-map",
    );
    const second = mapped()[1];
    trace.length = 0;
    expect(() => setItems([2, 3])).toThrow("cleanup");
    expect(trace).toEqual(["cleanup:1"]);
    fail = false;
    setItems([1, 2]);
    expect(trace).toEqual(["cleanup:1", "setup:1"]);
    expect(mapped()[1]).toBe(second);
    return dispose;
  });
  stop();
});

test("early removal cannot also defer ownership of removed roots", () => {
  expect(() =>
    mapArray(
      () => [],
      () => null,
      () => {},
      undefined,
      "before-map",
    ),
  ).toThrow("cannot be deferred");
});

test("early removal cleans failed replacements while preserving retained rows", () => {
  const [items, setItems] = createSignal([1, 2]);
  const trace: string[] = [];
  const stop = createRoot((dispose) => {
    const mapped = mapArray(
      items,
      (item) => {
        trace.push(`setup:${item}`);
        onCleanup(() => trace.push(`cleanup:${item}`));
        if (item === 4) throw Error("mapper");
        return { item };
      },
      undefined,
      undefined,
      "before-map",
    );
    const retained = mapped()[1];
    trace.length = 0;
    expect(() => setItems([2, 3, 4])).toThrow("mapper");
    expect(trace).toEqual([
      "cleanup:1",
      "setup:3",
      "setup:4",
      "cleanup:4",
      "cleanup:3",
    ]);
    setItems([2, 1]);
    expect(mapped()[0]).toBe(retained);
    expect(mapped().map((entry) => entry.item)).toEqual([2, 1]);
    return dispose;
  });
  stop();
});

test("early removal uses indexed array values without invoking its iterator", () => {
  const items = [1, 2];
  Object.defineProperty(items, Symbol.iterator, {
    value() {
      throw Error("iterator");
    },
  });
  const stop = createRoot((dispose) => {
    expect(
      mapArray(
        () => items,
        (value) => value,
        undefined,
        undefined,
        "before-map",
      )(),
    ).toEqual([1, 2]);
    return dispose;
  });
  stop();
});

test("early removal preserves matching duplicate prefixes and suffixes", () => {
  for (const [before, after, retainedIndexes] of [
    [
      [1, 1],
      [2, 1],
      [-1, 1],
    ],
    [
      [1, 1, 1],
      [1, 2, 1],
      [0, -1, 2],
    ],
  ] as const) {
    const [items, setItems] = createSignal<readonly number[]>(before);
    const stop = createRoot((dispose) => {
      const mapped = mapArray(
        items,
        (item) => ({ item }),
        undefined,
        undefined,
        "before-map",
      );
      const original = mapped();
      setItems(after);
      for (let i = 0; i < retainedIndexes.length; i++) {
        const previous = retainedIndexes[i]!;
        if (previous >= 0) expect(mapped()[i]).toBe(original[previous]);
        else expect(original.includes(mapped()[i]!)).toBe(false);
      }
      return dispose;
    });
    stop();
  }
});

test("early mapping publishes retained indexes before later replacement callbacks", () => {
  for (const order of ["after-map", "before-map"] as const) {
    const [items, setItems] = createSignal([1, 2]);
    const indexes = new Map<number, () => number>();
    const observed: number[] = [];
    const stop = createRoot((dispose) => {
      mapArray(
        items,
        (item, index) => {
          if (item === 3) observed.push(indexes.get(1)!());
          indexes.set(item, index);
          return item;
        },
        undefined,
        undefined,
        order,
      );
      setItems([2, 1, 3]);
      expect(observed).toEqual([order === "before-map" ? 1 : 0]);
      return dispose;
    });
    stop();
  }
});

test("owned fallbacks cannot transfer removed roots to a deferred owner", () => {
  expect(() =>
    mapArray(
      () => [],
      () => null,
      () => {},
      undefined,
      "after-map",
      () => "empty",
    ),
  ).toThrow("cannot be deferred");
});
