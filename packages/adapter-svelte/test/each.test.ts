import { afterEach, expect, test } from "bun:test";
import { h, render } from "@tschk/moonshine-dom/dom";
import { createSignal, onCleanup } from "@tschk/moonshine-dom/reactive";
import { withRuneScheduler } from "../src/pre";
import { keyedEach } from "../src/each";
import "../../react/test/dom";
let stop = () => {};
afterEach(() => {
  stop();
  stop = () => {};
  document.body.replaceChildren();
});
test("keys interleave row setup and observe actual movement at repeated visits", async () => {
  const trace: unknown[] = [];
  let write!: (items: string[]) => unknown;
  const rows = () =>
    Array.from(document.querySelectorAll("li"))
      .map((row) => row.textContent)
      .join("");
  stop = render(
    () =>
      withRuneScheduler(() => {
        const [items, set] = createSignal(["a", "b", "c"]);
        write = set;
        return h(
          "ul",
          {},
          keyedEach(
            items,
            (item, index) => {
              trace.push(["key", item, index, rows()]);
              return item;
            },
            (item) => {
              trace.push(["setup", item()]);
              onCleanup(() => trace.push(["stop", item()]));
              return h("li", {}, item);
            },
          ),
        );
      }),
    document.body,
  );
  expect(trace).toEqual([
    ["key", "a", 0, ""],
    ["setup", "a"],
    ["key", "b", 1, ""],
    ["setup", "b"],
    ["key", "c", 2, ""],
    ["setup", "c"],
  ]);
  trace.length = 0;
  write(["c", "a", "b"]);
  await Promise.resolve();
  expect(trace).toEqual([
    ["key", "c", 0, "abc"],
    ["key", "a", 1, "abc"],
    ["key", "b", 2, "abc"],
    ["key", "c", 0, "abc"],
    ["key", "a", 1, "abc"],
    ["key", "a", 1, "cab"],
    ["key", "b", 2, "cab"],
  ]);
  trace.length = 0;
  stop();
  expect(trace).toEqual([
    ["stop", "c"],
    ["stop", "a"],
    ["stop", "b"],
  ]);
});
test("local reads do not revisit keys; multi-node rows retain local state and position", async () => {
  let update!: (items: string[]) => unknown,
    keys = 0;
  const labels = new Map<string, () => void>();
  stop = render(
    () =>
      withRuneScheduler(() => {
        const [items, set] = createSignal(["a", "b"]);
        update = set;
        return h(
          "div",
          {},
          keyedEach(
            items,
            (item) => {
              keys++;
              return item;
            },
            (item, index) => {
              const [count, setCount] = createSignal(0);
              labels.set(item(), () => setCount(count() + 1));
              return [
                h("input", { value: item }),
                h("b", {}, () => item() + count() + "@" + index()),
              ];
            },
          ),
        );
      }),
    document.body,
  );
  const input = document.querySelector("input")!;
  input.value = "dirty";
  input.focus();
  labels.get("a")!();
  await Promise.resolve();
  expect(keys).toBe(2);
  expect(document.querySelector("b")!.textContent).toBe("a1@0");
  update(["b", "a"]);
  await Promise.resolve();
  expect(
    [...document.querySelectorAll("b")].map((node) => node.textContent),
  ).toEqual(["b0@0", "a1@1"]);
  expect(document.querySelectorAll("input")[1]).toBe(input);
  expect(input.value).toBe("dirty"); // Focus behavior is compared against Svelte in the actual Chromium source sweep.
});
test("function items, empty rows, SVG and fallback use native insertion ownership", async () => {
  const fn = () => 7;
  let update!: (items: (() => number)[]) => unknown;
  let cleaned = 0;
  stop = render(
    () =>
      withRuneScheduler(() => {
        const [items, set] = createSignal([fn]);
        update = set;
        return h(
          "svg",
          {},
          keyedEach(
            items,
            (item) => item,
            (item) => {
              onCleanup(() => cleaned++);
              return [
                h(
                  "a",
                  {},
                  h("text", {}, () => String(item()())),
                ),
                keyedEach(
                  () => [1],
                  (item) => item,
                  () => [],
                ),
              ];
            },
            () => h("text", {}, "empty"),
          ),
        );
      }),
    document.body,
  );
  expect(document.querySelector("a")!.namespaceURI).toBe(
    "http://www.w3.org/2000/svg",
  );
  expect(document.querySelector("svg")!.textContent).toBe("7");
  update([]);
  await Promise.resolve();
  expect(document.querySelector("svg")!.textContent).toBe("empty");
  expect(cleaned).toBe(1);
  update([fn]);
  await Promise.resolve();
  expect(document.querySelector("svg")!.textContent).toBe("7");
  stop();
  expect(cleaned).toBe(2);
});
test("non-idempotent keys diagnose and all provisional roots dispose", () => {
  let write!: (items: string[]) => unknown;
  let calls = 0,
    changeAt = 0;
  const setup: string[] = [],
    cleanup: string[] = [];
  stop = render(() => {
    const [items, set] = createSignal(["a", "b"]);
    write = set;
    return h(
      "ul",
      {},
      keyedEach(
        items,
        (item) => (++calls === changeAt ? "a" : item),
        (item) => {
          setup.push(item());
          onCleanup(() => cleanup.push(item()));
          return h("li", {}, item);
        },
      ),
    );
  }, document.body);
  calls = 0;
  changeAt = 5;
  expect(() => write(["a", "b", "c"])).toThrow(
    "Each key changed during reconciliation",
  );
  stop();
  expect(cleanup.toSorted()).toEqual(setup.toSorted());
});
test("preparation failures preserve primary error and drain new rows despite cleanup error", () => {
  let write!: (items: string[]) => unknown;
  const cleaned: string[] = [];
  stop = render(() => {
    const [items, set] = createSignal(["a"]);
    write = set;
    return h(
      "ul",
      {},
      keyedEach(
        items,
        (item) => {
          if (item === "bad") throw new Error("key-primary");
          return item;
        },
        (item) => {
          onCleanup(() => {
            cleaned.push(item());
            if (item() === "new") throw new Error("cleanup-secondary");
          });
          return h("li", {}, item);
        },
      ),
    );
  }, document.body);
  expect(() => write(["a", "new", "bad"])).toThrow("key-primary");
  expect(cleaned).toEqual(["new"]);
  stop();
  expect(cleaned).toEqual(["new", "a"]);
});
test("duplicate keys diagnose and drain a newly created row once", () => {
  let write!: (items: string[]) => unknown;
  const setups: string[] = [],
    cleanups: string[] = [];
  stop = render(() => {
    const [items, set] = createSignal<string[]>([]);
    write = set;
    return h(
      "ul",
      {},
      keyedEach(
        items,
        (item) => item,
        (item) => {
          setups.push(item());
          onCleanup(() => cleanups.push(item()));
          return h("li", {}, item);
        },
      ),
    );
  }, document.body);
  expect(() => write(["x", "x"])).toThrow("Duplicate each key");
  expect(setups).toEqual(["x"]);
  expect(cleanups).toEqual(["x"]);
  stop();
  expect(cleanups).toEqual(["x"]);
});
test("repeated empty collections retain the existing fallback root and DOM", async () => {
  let write!: (value: string[] | null | undefined) => unknown;
  let mounted = 0,
    cleaned = 0;
  stop = render(
    () =>
      withRuneScheduler(() => {
        const [items, set] = createSignal<string[] | null | undefined>([]);
        write = set;
        return h(
          "div",
          {},
          keyedEach(
            items,
            (item) => item,
            (item) => h("b", {}, item),
            () => {
              mounted++;
              onCleanup(() => cleaned++);
              return h("input", { value: "fallback" });
            },
          ),
        );
      }),
    document.body,
  );
  const field = document.querySelector("input")!;
  field.value = "dirty";
  for (const empty of [null, undefined, [], null]) {
    write(empty);
    await Promise.resolve();
    expect(document.querySelector("input")).toBe(field);
    expect(field.value).toBe("dirty");
    expect(mounted).toBe(1);
    expect(cleaned).toBe(0);
  }
  write(["a"]);
  await Promise.resolve();
  expect(document.querySelector("b")!.textContent).toBe("a");
  expect(cleaned).toBe(1);
  write([]);
  await Promise.resolve();
  expect(mounted).toBe(2);
  write(undefined);
  await Promise.resolve();
  expect(mounted).toBe(2);
  expect(cleaned).toBe(1);
  stop();
  expect(cleaned).toBe(2);
});

test("destructured key getters reconcile before retained row getters", async () => {
  const trace: string[] = [];
  let write!: (value: number) => unknown;
  stop = render(
    () =>
      withRuneScheduler(() => {
        const [noise, set] = createSignal(0);
        write = set;
        const row = {
          id: "a",
          get label() {
            void noise();
            trace.push("label");
            return "value";
          },
        };
        return keyedEach(
          () => [row],
          ({ id, label }) => {
            void label;
            trace.push("key");
            return id;
          },
          (item) => h("p", { title: () => item().label }, () => item().label),
        );
      }),
    document.body,
  );
  trace.length = 0;
  write(1);
  await Promise.resolve();
  expect(trace).toEqual(["label", "key", "label", "key", "label", "label"]);
  expect(document.querySelector("p")!.textContent).toBe("value");
});
