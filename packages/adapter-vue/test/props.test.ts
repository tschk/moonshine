import { expect, test } from "bun:test";
import {
  createComputed,
  createRoot,
  createSignal,
} from "@tschk/moonshine-dom/reactive";
import { createProps, createServerProps } from "../src/props";

test("initial props are a shallow, independent snapshot with declared optional keys", () => {
  const nested = { count: 1 },
    callback = () => nested;
  const source: {
    count: number;
    nested: typeof nested;
    callback: typeof callback;
    optional?: string;
  } = { count: 1, nested, callback };
  createRoot((stop) => {
    const props = createProps(source, [
      "count",
      "nested",
      "callback",
      "optional",
    ]);
    expect(props).not.toBe(source);
    expect(props.nested).toBe(nested);
    expect(props.callback).toBe(callback);
    expect(Object.hasOwn(props, "optional")).toBe(true);
    expect(props.optional).toBeUndefined();
    props.count = 3;
    props.nested.count = 2;
    expect(source.count).toBe(1);
    expect(source.nested.count).toBe(2);
    stop();
  });
  expect(() => createProps(source, ["count"])).toThrow("live native owner");
});

test("source getters keep receiver identity and parent refresh waits and coalesces", async () => {
  const [read, write] = createSignal(1);
  const [refresh, force] = createSignal(0);
  const source = {
    get count() {
      expect(this).toBe(source);
      refresh();
      return read();
    },
  };
  let props!: typeof source, stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    props = createProps(source, ["count"]);
  });
  Reflect.set(props, "count", 9);
  force(1);
  await Promise.resolve();
  expect(props.count).toBe(9);
  write(2);
  write(1);
  expect(props.count).toBe(9);
  await Promise.resolve();
  expect(props.count).toBe(9);
  write(2);
  write(3);
  expect(props.count).toBe(9);
  await Promise.resolve();
  expect(props.count).toBe(3);
  expect(read()).toBe(3);
  stop();
});

test("local writes, deletes and presence are reactive and parent refresh restores declared keys", async () => {
  const [read, write] = createSignal(1);
  let props!: { count?: number }, stop!: () => void;
  const values: unknown[] = [],
    presence: boolean[] = [],
    keys: string[][] = [];
  createRoot((dispose) => {
    stop = dispose;
    props = createProps(
      {
        get count() {
          return read();
        },
      },
      ["count"],
    );
    createComputed(() => {
      values.push(props.count);
    });
    createComputed(() => {
      presence.push("count" in props);
    });
    createComputed(() => {
      keys.push(Object.keys(props));
    });
  });
  props.count = 7;
  delete props.count;
  expect(values).toEqual([1, 7, undefined]);
  expect(presence).toEqual([true, false]);
  expect(keys).toEqual([["count"], []]);
  write(2);
  await Promise.resolve();
  expect(props.count).toBe(2);
  expect(presence).toEqual([true, false, true]);
  expect(keys).toEqual([["count"], [], ["count"]]);
  stop();
});

test("inherited enumerable initial values clear on later own-prop refresh", async () => {
  const [read, write] = createSignal(1);
  const source = Object.create({ label: "inherited" }) as {
    count: number;
    label?: string;
  };
  Object.defineProperty(source, "count", { enumerable: true, get: read });
  let props!: typeof source, stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    props = createProps(source, ["label", "count"]);
  });
  expect(props.label).toBe("inherited");
  write(2);
  expect(props.label).toBe("inherited");
  await Promise.resolve();
  expect(props.count).toBe(2);
  expect(Object.hasOwn(props, "label")).toBe(true);
  expect(props.label).toBeUndefined();
  stop();
});

test("sibling snapshots refresh independently and disposal cancels pending parent writes", async () => {
  const [read, write] = createSignal(1);
  let first!: { count: number },
    second!: { count: number },
    stopFirst!: () => void,
    stopSecond!: () => void;
  createRoot((dispose) => {
    stopFirst = dispose;
    first = createProps(
      {
        get count() {
          return read();
        },
      },
      ["count"],
    );
  });
  createRoot((dispose) => {
    stopSecond = dispose;
    second = createProps(
      {
        get count() {
          return read();
        },
      },
      ["count"],
    );
  });
  first.count = 9;
  expect(second.count).toBe(1);
  write(2);
  stopFirst();
  await Promise.resolve();
  expect(first.count).toBe(9);
  expect(second.count).toBe(2);
  write(3);
  stopSecond();
  await Promise.resolve();
  expect(second.count).toBe(2);
});

test("server snapshots preserve safe keys and identities without observing parent changes", () => {
  const nested = { value: 1 },
    callback = () => nested;
  let count = 1;
  const source: {
    count: number;
    nested: typeof nested;
    callback: typeof callback;
    optional?: string;
    __proto__?: unknown;
  } = {
    get count() {
      expect(this).toBe(source);
      return count;
    },
    nested,
    callback,
  };
  Object.defineProperty(source, "__proto__", {
    value: "literal",
    enumerable: true,
  });
  const first = createServerProps(source, [
    "count",
    "nested",
    "callback",
    "optional",
    "__proto__",
  ]);
  count = 2;
  const second = createServerProps(source, [
    "count",
    "nested",
    "callback",
    "optional",
    "__proto__",
  ]);
  expect(first.count).toBe(1);
  expect(second.count).toBe(2);
  expect(first.nested).toBe(nested);
  expect(first.callback).toBe(callback);
  expect(Object.hasOwn(first, "optional")).toBe(true);
  expect(first.__proto__).toBe("literal");
  expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
  first.count = 7;
  expect(second.count).toBe(2);
});

test("nested parent refreshes settle in one microtask before queued child snapshots", async () => {
  for (const childFirst of [true, false]) {
    const [read, write] = createSignal(1);
    const observed: number[] = [];
    let parent!: { count: number },
      child!: { count: number },
      grandchild!: { count: number },
      stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      parent = createProps(
        {
          get count() {
            return read();
          },
        },
        ["count"],
      );
      child = createProps(
        {
          get count() {
            return parent.count;
          },
        },
        ["count"],
      );
      grandchild = createProps(
        {
          get count() {
            return child.count;
          },
        },
        ["count"],
      );
      createComputed(() => {
        observed.push(grandchild.count);
      });
    });
    try {
      if (childFirst) {
        parent.count = 3;
        write(2);
      } else {
        write(2);
        parent.count = 3;
      }
      await Promise.resolve();
      expect([parent.count, child.count, grandchild.count]).toEqual([2, 2, 2]);
      expect(observed).toEqual([1, 2]);
      write(4);
      stop();
      await Promise.resolve();
      expect([parent.count, child.count, grandchild.count]).toEqual([2, 2, 2]);
    } finally {
      stop();
    }
  }
});
