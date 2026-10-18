import { expect, test } from "bun:test";
import {
  createRoot,
  createComputed,
  createSignal,
  catchError,
} from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { createEmitter, type Emit, type EventListeners } from "../src/events";
type Events = { change: [number, string]; "item-change": [number] };
test("payloads, undefined receiver, once reentry and disposal", () => {
  let fire!: Emit<Events>, stop!: () => void;
  const seen: unknown[] = [];
  const props: EventListeners<Events> = {
    onChange: function (n, s) {
      seen.push([this === undefined, n, s]);
    },
    onChangeOnce: (n, s) => {
      seen.push("once");
      fire("change", n + 1, s);
    },
  };
  createRoot((dispose) => {
    stop = dispose;
    createComponent(
      () => {
        fire = createEmitter<Events>(props);
      },
      props,
      "dom",
    );
  });
  fire("change", 1, "x");
  fire("change", 3, "x");
  expect(seen).toEqual([
    [true, 1, "x"],
    "once",
    [true, 2, "x"],
    [true, 3, "x"],
  ]);
  stop();
  fire("change", 4, "x");
  expect(seen).toHaveLength(4);
});
test("native error boundaries receive callback failures and async rejections", async () => {
  const seen: string[] = [];
  let fire!: Emit<Events>, stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    catchError(
      () =>
        createComponent(
          () => {
            fire = createEmitter<Events>({
              onChange: [
                () => {
                  seen.push("first");
                  throw Error("sync");
                },
                () => seen.push("peer"),
              ],
              onChangeOnce: () => Promise.reject(Error("async")),
            });
          },
          {},
          "dom",
        ),
      (e) => seen.push("caught:" + e.message),
    );
  });
  fire("change", 1, "x");
  expect(seen.slice(0, 2)).toEqual(["first", "peer"]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(seen).toEqual(["first", "peer", "caught:sync", "caught:async"]);
  stop();
});
test("without a boundary, callbacks drain before the first error is thrown", () => {
  const one = Error("one"),
    two = Error("two"),
    seen: string[] = [];
  let fire!: Emit<Events>;
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        fire = createEmitter<Events>({
          onChange: [
            () => {
              throw one;
            },
            () => seen.push("peer"),
          ],
          onChangeOnce: () => {
            seen.push("once");
            throw two;
          },
        });
      },
      {},
      "dom",
    );
    return dispose;
  });
  expect(() => fire("change", 1, "x")).toThrow(one);
  expect(seen).toEqual(["peer", "once"]);
  stop();
});
test("callbacks and raw listener getters stay untracked; SSR delivers after disposal", () => {
  const [get, set] = createSignal(0);
  let emit!: Emit<Events>,
    runs = 0;
  createRoot((stop) => {
    createComponent(
      () => {
        emit = createEmitter<Events>({
          get onChange() {
            get();
            return () => get();
          },
        });
      },
      {},
      "ssr",
    );
    createComputed(() => {
      runs++;
      emit("change", 1, "x");
    });
    set(1);
    expect(runs).toBe(1);
    stop();
  });
  emit("change", 2, "x");
});

test("live arrays and recursive emits claim once before its callback", () => {
  let emit!: Emit<Events>;
  const seen: unknown[] = [];
  const callbacks: Array<() => void> = [
    () => {
      seen.push("first");
      callbacks.push(() => seen.push("appended"));
    },
  ];
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        emit = createEmitter<Events>({ onChange: callbacks });
      },
      {},
      "dom",
    );
    return dispose;
  });
  emit("change", 1, "x");
  expect(seen).toEqual(["first", "appended"]);
  stop();
  seen.length = 0;
  const second = createRoot((dispose) => {
    createComponent(
      () => {
        emit = createEmitter<Events>({
          onChange: (n: number) => {
            seen.push(["regular", n]);
            if (n === 0) emit("change", 1, "x");
          },
          onChangeOnce: (n: number) => seen.push(["once", n]),
        });
      },
      {},
      "dom",
    );
    return dispose;
  });
  emit("change", 0, "x");
  expect(seen).toEqual([
    ["regular", 0],
    ["regular", 1],
    ["once", 1],
  ]);
  second();
});
test("late async rejection delegates a disposed inner boundary to its live ancestor", async () => {
  let emit!: Emit<Events>, stopInner!: () => void;
  let reject!: (e: unknown) => void;
  const error = Error("late"),
    seen: string[] = [];
  const promise = new Promise((_, no) => (reject = no));
  const stopOuter = createRoot((dispose) => {
    catchError(
      () =>
        createRoot((inner) => {
          stopInner = inner;
          catchError(
            () =>
              createComponent(
                () => {
                  emit = createEmitter<Events>({ onChange: () => promise });
                },
                {},
                "dom",
              ),
            () => seen.push("inner"),
          );
        }),
      (e) => seen.push("outer:" + e.message),
    );
    return dispose;
  });
  emit("change", 1, "x");
  stopInner();
  reject(error);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(seen).toEqual(["outer:late"]);
  stopOuter();
});

test("listener getters keep their receiver and once lookup follows regular delivery", () => {
  let emit!: Emit<Events>;
  const seen: string[] = [];
  const source = {
    once: () => seen.push("old"),
    get onChange() {
      expect(this).toBe(source);
      seen.push("get regular");
      return () => {
        seen.push("regular");
        source.once = () => seen.push("new");
      };
    },
    get onChangeOnce() {
      expect(this).toBe(source);
      seen.push("get once");
      return this.once;
    },
  };
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        emit = createEmitter<Events>(source);
      },
      {},
      "dom",
    );
    return dispose;
  });
  emit("change", 1, "x");
  expect(seen).toEqual(["get regular", "regular", "get once", "new"]);
  stop();
});

test("component model events publish the value before observers and retain once semantics", () => {
  let fire!: Emit<{ "update:modelValue": [string] }>;
  let stop!: () => void;
  const [read, set] = createSignal("initial");
  const seen: string[] = [];
  createRoot((dispose) => {
    stop = dispose;
    const props: EventListeners<{ "update:modelValue": [string] }> = {
      "onUpdate:modelValue": [
        (value) => {
          set(value);
        },
        () => {
          seen.push(read());
        },
      ],
      "onUpdate:modelValueOnce": () => {
        seen.push("once:" + read());
      },
    };
    createComponent(
      () => {
        fire = createEmitter(props);
      },
      props,
      "dom",
    );
  });
  fire("update:modelValue", "next");
  fire("update:modelValue", "again");
  expect(seen).toEqual(["next", "once:next", "again"]);
  stop();
  fire("update:modelValue", "disposed");
  expect(read()).toBe("again");
});

test("named model events keep distinct payloads and camelize kebab update keys", () => {
  let fire!: Emit<{
    "update:title": [string];
    "update:count": [number];
    "update:first-name": [string];
  }>;
  let stop!: () => void;
  const seen: unknown[] = [];
  createRoot((dispose) => {
    stop = dispose;
    const props = {
      "onUpdate:title": (value: string) => seen.push(["title", value]),
      "onUpdate:count": (value: number) => seen.push(["count", value]),
      "onUpdate:firstName": (value: string) => seen.push(["name", value]),
    };
    createComponent(
      () => {
        fire = createEmitter(props);
      },
      props,
      "dom",
    );
  });
  fire("update:title", "next");
  fire("update:count", 2);
  fire("update:first-name", "n");
  expect(seen).toEqual([
    ["title", "next"],
    ["count", 2],
    ["name", "n"],
  ]);
  stop();
});
