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

type Loose = Emit<Record<string, unknown[]>>;
function mount(props: Record<string, unknown>) {
  let fire!: Loose, stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    createComponent(
      () => {
        fire = createEmitter<Record<string, unknown[]>>(props);
      },
      props,
      "dom",
    );
  });
  return { fire, stop };
}

test("trim and number map every raw argument and feed listener and once alike", () => {
  const run = (modelModifiers: object, ...payload: unknown[]) => {
    const seen: unknown[][] = [];
    const { fire, stop } = mount({
      modelModifiers,
      "onUpdate:modelValue": (...args: unknown[]) => seen.push(args),
      "onUpdate:modelValueOnce": (...args: unknown[]) => seen.push(args),
    });
    fire("update:modelValue", ...payload);
    expect(seen[1]).toEqual(seen[0]!);
    stop();
    return seen[0];
  };
  const payload = [" a ", " 12px ", 3, null];
  expect(run({ trim: true }, ...payload)).toEqual(["a", "12px", 3, null]);
  expect(run({ number: true }, ...payload)).toEqual([" a ", 12, 3, null]);
  expect(run({ trim: true, number: true }, ...payload)).toEqual([
    " a ",
    12,
    3,
    null,
  ]);
  expect(run({ number: true }, [1, 2], true, "", 5n)).toEqual([1, true, "", 5]);
});

test("named models read exact, camel then hyphen modifier keys; the default model reads only modelModifiers", () => {
  const seen: unknown[] = [];
  const props: Record<string, unknown> = {
    "onUpdate:firstName": (value: unknown) => seen.push(["first", value]),
    "onUpdate:title": (value: unknown) => seen.push(["title", value]),
    "onUpdate:modelValue": (value: unknown) => seen.push(["model", value]),
    "first-nameModifiers": { trim: true },
    modelModifiers: { trim: false },
    modelValueModifiers: { trim: true },
    titleModifiers: { trim: false },
  };
  const { fire, stop } = mount(props);
  fire("update:firstName", " a ");
  fire("update:first-name", " b ");
  fire("update:modelValue", " c ");
  fire("update:model-value", " d ");
  expect(seen).toEqual([
    ["first", "a"],
    ["first", "b"],
    ["model", " c "],
    ["model", " d "],
  ]);
  seen.length = 0;
  delete props["first-nameModifiers"];
  props.firstNameModifiers = { trim: true };
  props.modelModifiers = { trim: true };
  props.titleModifiers = { number: true };
  fire("update:firstName", " e ");
  fire("update:title", "7px");
  fire("update:modelValue", " f ");
  expect(seen).toEqual([
    ["first", "e"],
    ["title", 7],
    ["model", "f"],
  ]);
  props["first-nameModifiers"] = false;
  fire("update:first-name", " g ");
  props["first-nameModifiers"] = { trim: false };
  fire("update:first-name", " h ");
  expect(seen.slice(-2)).toEqual([
    ["first", "g"],
    ["first", " h "],
  ]);
  stop();
});

test("modifier flags are read live on every emit and custom flags leave payloads alone", () => {
  const seen: unknown[] = [];
  let current: unknown;
  const props = {
    get modelModifiers() {
      return current;
    },
    "onUpdate:modelValue": (value: unknown) => seen.push(value),
  };
  const { fire, stop } = mount(props);
  fire("update:modelValue", " 1 ");
  current = { trim: true };
  fire("update:modelValue", " 2 ");
  current = { number: true };
  fire("update:modelValue", " 3 ");
  current = { capitalize: true, trim: false, number: 0 };
  fire("update:modelValue", " 4 ");
  current = undefined;
  fire("update:modelValue", " 5 ");
  expect(seen).toEqual([" 1 ", "2", 3, " 4 ", " 5 "]);
  stop();
});

test("number mapping throws unrouted before any listener runs and disposal still wins", () => {
  const seen: string[] = [];
  const { fire, stop } = mount({
    modelModifiers: { number: true },
    "onUpdate:modelValue": () => seen.push("listener"),
    "onUpdate:modelValueOnce": () => seen.push("once"),
  });
  expect(() => fire("update:modelValue", Symbol("s") as never)).toThrow(
    TypeError,
  );
  expect(seen).toEqual([]);
  fire("update:modelValue", "1" as never);
  expect(seen).toEqual(["listener", "once"]);
  stop();
  expect(() => fire("update:modelValue", Symbol("s") as never)).not.toThrow();
  expect(seen).toHaveLength(2);
});
