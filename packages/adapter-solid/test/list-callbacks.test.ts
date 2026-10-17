import { expect, test } from "bun:test";
import { For, Index } from "../src/solid";
import {
  createRoot,
  createSignal,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";

for (const list of [For, Index]) {
  test(`${list.name} captures its callback once and invokes it without a receiver`, () => {
    const [items, setItems] = createSignal([1]);
    const trace: string[] = [];
    const stop = createRoot((dispose) => {
      const mapped = list({
        get each() {
          trace.push("each");
          return items();
        },
        get children() {
          trace.push("children");
          return function (this: unknown, item: number | (() => number)) {
            expect(this).toBeUndefined();
            return typeof item === "function" ? item : () => item;
          };
        },
      });
      expect(mapped()?.map((read) => read())).toEqual([1]);
      setItems([2, 3]);
      expect(mapped()?.map((read) => read())).toEqual([2, 3]);
      expect(trace.filter((entry) => entry === "children")).toHaveLength(1);
      expect(trace[0]).toBe("children");
      return dispose;
    });
    stop();
  });
}

test("DOM For supplies an index only when the captured callback declares it", () => {
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    For({
      each: [1],
      children: function (item: number, ...rest: unknown[]) {
        seen.push(rest.length);
        return item;
      },
    })();
    For({
      each: [1],
      children: function (item: number, index: () => number) {
        seen.push(arguments.length);
        return item + index();
      },
    })();
    return dispose;
  });
  stop();
  expect(seen).toEqual([0, 2]);
});

test("DOM For snapshots the input length before invoking row callbacks", () => {
  const items = [1];
  const stop = createRoot((dispose) => {
    const mapped = For({
      each: items,
      children: (item) => {
        if (item === 1) items.push(2);
        return item;
      },
    });
    expect(mapped()).toEqual([1]);
    expect(items).toEqual([1, 2]);
    return dispose;
  });
  stop();
});

for (const list of [For, Index]) {
  test(`${list.name} observes notified changes to the same array`, () => {
    const [version, invalidate] = createSignal(0);
    const items = [1];
    const stop = createRoot((dispose) => {
      const mapped = list({
        get each() {
          version();
          return items;
        },
        children: (item: number | (() => number)) =>
          typeof item === "function" ? item : () => item,
      });
      expect(mapped()?.map((read) => read())).toEqual([1]);
      items.push(2);
      invalidate(1);
      expect(mapped()?.map((read) => read())).toEqual([1, 2]);
      return dispose;
    });
    stop();
  });

  test(`${list.name} replaces its owned fallback on each notified empty value`, () => {
    const [items, setItems] = createSignal<
      readonly number[] | false | null | undefined
    >([]);
    let serial = 0;
    const cleanups: number[] = [];
    const stop = createRoot((dispose) => {
      const mapped = list({
        get each() {
          return items();
        },
        children: (item: number | (() => number)) =>
          typeof item === "function" ? item() : item,
        get fallback() {
          const id = ++serial;
          onCleanup(() => cleanups.push(id));
          return id;
        },
      });
      expect(mapped()).toBe(1);
      for (const [index, empty] of [false, null, undefined].entries()) {
        setItems(empty);
        expect(mapped()).toBe(index + 2);
      }
      expect(cleanups).toEqual([1, 2, 3]);
      setItems([7]);
      expect(mapped()).toEqual([7]);
      expect(cleanups).toEqual([1, 2, 3, 4]);
      return dispose;
    });
    stop();
  });
}

test("DOM Index publishes retained item values before creating later positions", () => {
  const [items, setItems] = createSignal([1]);
  const accessors = new Map<number, () => number>();
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    Index({
      get each() {
        return items();
      },
      children: (item, index) => {
        if (index === 1) seen.push(accessors.get(0)!());
        accessors.set(index, item);
        return item;
      },
    })();
    setItems([2, 3]);
    expect(seen).toEqual([2]);
    return dispose;
  });
  stop();
});

test("DOM Index captures each new item and the list length before its callback mutates them", () => {
  const items = [1];
  const stop = createRoot((dispose) => {
    const mapped = Index({
      each: items,
      children: (item) => {
        if (item() === 1) {
          items[0] = 99;
          items.push(2);
        }
        return item;
      },
    });
    expect(mapped()?.map((read) => read())).toEqual([1]);
    expect(items).toEqual([99, 2]);
    return dispose;
  });
  stop();
});

for (const list of [For, Index]) {
  test(`${list.name} drains failed fallback work and recovers on the next value`, () => {
    const [items, setItems] = createSignal<number[]>([1]);
    const cleaned: string[] = [];
    let fail = true;
    const original = Error("fallback");
    const stop = createRoot((dispose) => {
      const mapped = list({
        get each() {
          return items();
        },
        children: (value: number | (() => number)) => {
          const item = typeof value === "function" ? value() : value;
          onCleanup(() => cleaned.push(`row:${item}`));
          return item;
        },
        get fallback() {
          onCleanup(() => cleaned.push("fallback"));
          if (fail) throw original;
          return "empty";
        },
      });
      expect(() => setItems([])).toThrow(original);
      expect(cleaned).toEqual(["row:1", "fallback"]);
      fail = false;
      setItems([2]);
      expect(mapped()).toEqual([2]);
      setItems([]);
      expect(mapped()).toBe("empty");
      return dispose;
    });
    stop();
    expect(cleaned).toEqual(["row:1", "fallback", "row:2", "fallback"]);
  });

  test(`${list.name} disposes a fallback that stops its parent during setup`, () => {
    const [items, setItems] = createSignal([1]);
    let stop!: () => void;
    let cleaned = 0;
    stop = createRoot((dispose) => {
      list({
        get each() {
          return items();
        },
        children: () => 1,
        get fallback() {
          onCleanup(() => cleaned++);
          stop();
          return "unused";
        },
      })();
      return dispose;
    });
    setItems([]);
    stop();
    expect(cleaned).toBe(1);
  });
}

test("DOM Index retains live slots when a new callback shrinks the source array", () => {
  const [items, setItems] = createSignal([1]);
  const cleaned: number[] = [];
  let mapped!: () => unknown;
  const stop = createRoot((dispose) => {
    mapped = Index({
      get each() {
        return items();
      },
      children: (item, index) => {
        onCleanup(() => cleaned.push(index));
        if (index === 1) items().length = 0;
        return item;
      },
    });
    mapped();
    return dispose;
  });
  setItems([1, 2]);
  mapped();
  expect(cleaned).toEqual([]);
  stop();
  expect(cleaned).toEqual([0, 1]);
});
