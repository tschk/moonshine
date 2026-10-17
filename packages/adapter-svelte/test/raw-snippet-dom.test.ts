import { withRuneScheduler } from "../src/pre";
import { getRenderScheduler } from "@tschk/moonshine-dom/reactive";
import {
  onCleanup,
  runWithOwner,
  createSignal,
} from "@tschk/moonshine-dom/reactive";
import { mapArray } from "@tschk/moonshine-dom/control";
import { invokeSnippetDOM } from "../src/raw-snippet-dom";
import { createRawSnippet } from "../src/raw-snippet";
import { test, expect } from "bun:test";
import { h, render } from "@tschk/moonshine-dom/dom";
import { Show } from "@tschk/moonshine-dom/control";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { createState, createRuneEffect, createRuneRoot } from "../src/runes";
import {
  onMount,
  onDestroy,
  getContext,
  setContext,
  tick,
} from "../src/svelte";
import { invokeRawDOM as bridgeDOM } from "../src/raw-snippet-dom";
import "../../react/test/dom";
const raw =
  (factory: any) =>
  (...cells: any[]) => {
    const consumer = peekComponentContext()!;
    return invokeRawDOM(factory, cells, consumer, consumer.active);
  };
test("raw initial work survives hides; remount work stops with branch; exact official two-instance trace", async () => {
  const trace: unknown[][] = [],
    apis: Record<
      string,
      { set(value: string): void; show(value: boolean): void }
    > = {};
  function App({ id, initial = "one" }: { id: string; initial?: string }) {
    const value = createState(initial),
      shown = createState(true);
    let serial = 0;
    const snippet = raw((read: () => string) => {
      const instance = ++serial;
      trace.push(["factory", id, instance, read()]);
      return {
        render() {
          trace.push(["render", id, instance, read()]);
          return " <b>" + read() + "</b> ";
        },
        setup(element: Element) {
          trace.push([
            "setup",
            id,
            instance,
            element.isConnected,
            element.localName,
            read(),
          ]);
          createRuneEffect(() => {
            const current = read();
            element.textContent = current;
            trace.push(["effect", id, instance, current]);
            return () => trace.push(["effect-cleanup", id, instance, current]);
          });
          onMount(() => {
            trace.push(["mounted", id, instance, element.isConnected]);
            return () =>
              trace.push(["mount-cleanup", id, instance, element.isConnected]);
          });
          onDestroy(() =>
            trace.push(["destroyed", id, instance, element.isConnected]),
          );
          return () =>
            trace.push(["cleanup", id, instance, element.isConnected, read()]);
        },
      };
    });
    apis[id] = {
      set(next) {
        value.value = next;
      },
      show(next) {
        shown.value = next;
      },
    };
    return h(
      "section",
      { "data-id": id },
      Show({
        when: () => shown.value,
        children: () =>
          snippet({
            get value() {
              return value.value;
            },
          }),
      }),
      h("span", {}, () => value.value),
    );
  }
  const target = document.createElement("main");
  document.body.append(target);
  const stop = render(
    () => [h(App, { id: "a" }), h(App, { id: "b", initial: "other" })],
    target,
  );
  const records: Record<string, unknown> = {};
  const record = async (name: string) => {
    await tick();
    records[name] = structuredClone(trace);
  };
  try {
    await record("initial");
    const retained = target.querySelector("b");
    apis.a!.set("two");
    await record("updated");
    expect(target.querySelector("b")).toBe(retained);
    apis.a!.show(false);
    await record("hide-first");
    apis.a!.set("hidden-one");
    await record("write-hidden-first");
    apis.a!.show(true);
    await record("remount");
    apis.a!.show(false);
    await record("hide-second");
    apis.a!.set("hidden-two");
    await record("write-hidden-second");
    stop();
    await record("stopped");
    const expected = [
      ["factory", "a", 1, "one"],
      ["render", "a", 1, "one"],
      ["setup", "a", 1, false, "b", "one"],
      ["factory", "b", 1, "other"],
      ["render", "b", 1, "other"],
      ["setup", "b", 1, false, "b", "other"],
      ["effect", "a", 1, "one"],
      ["mounted", "a", 1, true],
      ["effect", "b", 1, "other"],
      ["mounted", "b", 1, true],
      ["effect-cleanup", "a", 1, "one"],
      ["effect", "a", 1, "two"],
      ["cleanup", "a", 1, false, "two"],
      ["effect-cleanup", "a", 1, "two"],
      ["effect", "a", 1, "hidden-one"],
      ["factory", "a", 2, "hidden-one"],
      ["render", "a", 2, "hidden-one"],
      ["setup", "a", 2, true, "b", "hidden-one"],
      ["effect", "a", 2, "hidden-one"],
      ["mounted", "a", 2, true],
      ["effect-cleanup", "a", 2, "hidden-one"],
      ["mount-cleanup", "a", 2, false],
      ["destroyed", "a", 2, false],
      ["cleanup", "a", 2, false, "hidden-one"],
      ["effect-cleanup", "a", 1, "hidden-one"],
      ["effect", "a", 1, "hidden-two"],
      ["effect-cleanup", "a", 1, "hidden-two"],
      ["mount-cleanup", "a", 1, false],
      ["destroyed", "a", 1, false],
      ["cleanup", "b", 1, false, "other"],
      ["effect-cleanup", "b", 1, "other"],
      ["mount-cleanup", "b", 1, false],
      ["destroyed", "b", 1, false],
    ];
    const lengths = {
      initial: 10,
      updated: 12,
      "hide-first": 13,
      "write-hidden-first": 15,
      remount: 20,
      "hide-second": 24,
      "write-hidden-second": 26,
      stopped: 33,
    };
    for (const [phase, length] of Object.entries(lengths))
      expect(records[phase]).toEqual(expected.slice(0, length));
  } finally {
    stop();
    target.remove();
  }
});
test("authored consumer context and independent manual roots survive wrapper and component teardown", async () => {
  const trace: unknown[][] = [];
  let write = (_next: string) => {},
    show = (_next: boolean) => {},
    stopManual = () => {};
  function App() {
    setContext("where", "consumer");
    const value = createState("one"),
      visible = createState(true);
    write = (next) => (value.value = next);
    show = (next) => (visible.value = next);
    const consumer = peekComponentContext()!;
    const snippet = (...cells: any[]) =>
      invokeRawDOM(
        (read: () => string) => ({
          render: () => "<b>ready</b>",
          setup(element) {
            expect(getContext("where")).toBe("consumer");
            setContext("raw", "set");
            onDestroy(() => trace.push(["destroy", "consumer"]));
            stopManual = createRuneRoot(() => {
              createRuneEffect(() => {
                const current = read();
                trace.push(["manual", current]);
                return () => trace.push(["manual-clean", current]);
              });
              return () => trace.push(["root-clean"]);
            });
            return () => trace.push(["returned", element.isConnected]);
          },
        }),
        cells,
        consumer,
        consumer.active,
      );
    return h(
      "section",
      {},
      Show({
        when: () => visible.value,
        children: () =>
          snippet({
            get value() {
              return value.value;
            },
          }),
      }),
    );
  }
  const target = document.createElement("main");
  document.body.append(target);
  const stop = render(() => h(App, {}), target);
  try {
    await tick();
    show(false);
    await tick();
    write("hidden");
    await tick();
    stop();
    write("after");
    await tick();
    stopManual();
    expect(trace).toEqual([
      ["manual", "one"],
      ["returned", false],
      ["manual-clean", "one"],
      ["manual", "hidden"],
      ["destroy", "consumer"],
      ["manual-clean", "hidden"],
      ["manual", "after"],
      ["manual-clean", "after"],
      ["root-clean"],
    ]);
  } finally {
    stop();
    stopManual();
    target.remove();
  }
});
test("setup failure preserves primary error while draining owned cleanup", () => {
  const target = document.createElement("main");
  document.body.append(target);
  let cleaned = 0;
  expect(() =>
    render(
      () =>
        h(() => {
          const frame = peekComponentContext()!;
          return invokeRawDOM(
            () => ({
              render: () => "<b>ready</b>",
              setup() {
                onDestroy(() => {
                  cleaned++;
                  throw Error("cleanup secondary");
                });
                throw Error("setup primary");
              },
            }),
            [],
            frame,
            true,
          );
        }, {}),
      target,
    ),
  ).toThrow("setup primary");
  expect(cleaned).toBe(1);
  expect(target.querySelector("b")).toBeNull();
  target.remove();
});

function invokeRawDOM(
  factory: any,
  cells: any[],
  consumer: any,
  initial: boolean,
) {
  return bridgeDOM(
    createRawSnippet(factory),
    cells,
    consumer,
    initial,
    undefined,
  );
}
test("caller-owned dynamic snippet range replaces ordinary/raw functions and optional clearing", async () => {
  const trace: string[] = [];
  const [selected, setSelected] = createSignal<any>();
  const [value, setValue] = createSignal("one");
  const ordinary = (cell: { readonly value: string }) =>
    h("i", {}, () => cell.value);
  const snippet = createRawSnippet<[string]>((read) => ({
    render: () => "<b>raw</b>",
    setup(element) {
      createRuneEffect(() => (element.textContent = read()));
      return () => trace.push("raw-clean");
    },
  }));
  const target = document.createElement("main");
  document.body.append(target);
  const stop = render(
    () =>
      h(() => {
        const consumer = peekComponentContext()!;
        return mapArray(
          () => (selected() ? [selected()] : []),
          (fn) =>
            invokeSnippetDOM(
              fn,
              [
                {
                  get value() {
                    return value();
                  },
                },
              ],
              consumer,
              consumer.active,
              undefined,
            ),
        );
      }, {}),
    target,
  );
  try {
    setSelected(() => ordinary);
    expect(target.querySelector("i")?.textContent).toBe("one");
    setSelected(() => snippet);
    await tick();
    const node = target.querySelector("b");
    expect(node?.textContent).toBe("one");
    setValue("two");
    await tick();
    expect(target.querySelector("b")).toBe(node);
    expect(node?.textContent).toBe("two");
    setSelected(() => ordinary);
    expect(trace).toEqual(["raw-clean"]);
    expect(target.querySelector("i")?.textContent).toBe("two");
    setSelected(undefined);
    expect(target.textContent).toBe("");
    stop();
    setValue("late");
    expect(trace).toEqual(["raw-clean"]);
  } finally {
    stop();
    target.remove();
  }
});
test("parent disposal during setup runs a late returned cleanup exactly once", () => {
  const target = document.createElement("main");
  document.body.append(target);
  let consumer!: import("@tschk/moonshine-dom/component").ComponentContext;
  let late = 0,
    owned = 0;
  const stop = render(
    () =>
      h(() => {
        consumer = peekComponentContext()!;
        return h("span", {}, "owner");
      }, {}),
    target,
  );
  runWithOwner(consumer.owner, () => {
    const snippet = createRawSnippet(() => ({
      render: () => "<b data-cancel>cancel</b>",
      setup() {
        onCleanup(() => owned++);
        stop();
        return () => late++;
      },
    }));
    h("section", {}, invokeSnippetDOM(snippet, [], consumer, false, undefined));
  });
  expect(late).toBe(1);
  expect(owned).toBe(1);
  expect(target.querySelector("[data-cancel]")).toBeNull();
  stop();
  expect(late).toBe(1);
  target.remove();
});
test("invalid raw roots fail before reading setup", () => {
  for (const markup of ["", "text", "<b>a</b><i>b</i>"]) {
    const target = document.createElement("main");
    let setupReads = 0;
    expect(() =>
      render(
        () =>
          h(() => {
            const consumer = peekComponentContext()!;
            return invokeSnippetDOM(
              createRawSnippet(() => ({
                render: () => markup,
                get setup() {
                  setupReads++;
                  return () => {};
                },
              })),
              [],
              consumer,
              true,
              undefined,
            );
          }, {}),
        target,
      ),
    ).toThrow("one element");
    expect(setupReads).toBe(0);
    expect(target.childNodes.length).toBe(0);
  }
});

test("scheduled replacements run active branch effects before retained initial consumer effects", async () => {
  const trace: string[] = [];
  const value = createState("one");
  const selected = createState("A");
  let consumer!: import("@tschk/moonshine-dom/component").ComponentContext;
  function App() {
    consumer = peekComponentContext()!;
    return withRuneScheduler(() => {
      const consumerScheduler = getRenderScheduler();
      const make = (name: string) =>
        createRawSnippet<[string]>((read) => ({
          render: () => "<b>" + name + "</b>",
          setup(element) {
            createRuneEffect(() => {
              const current = read();
              element.textContent = name + ":" + current;
              trace.push(name + ":" + current);
            });
          },
        }));
      const snippets = { A: make("A"), B: make("B") };
      return h(
        "section",
        {},
        mapArray(
          () => (selected.value ? [selected.value] : []),
          (name) => {
            const initializing = consumer.active;
            // A synthetic render frame must not supply the consumer's phase metadata.
            return h(
              () =>
                invokeSnippetDOM(
                  snippets[name as "A" | "B"],
                  [
                    {
                      get value() {
                        return value.value;
                      },
                    },
                  ],
                  consumer,
                  initializing,
                  consumerScheduler,
                ),
              {},
            );
          },
        ),
      );
    });
  }
  const target = document.createElement("main");
  document.body.append(target);
  const stop = render(() => h(App, {}), target);
  try {
    await tick();
    expect(trace).toEqual(["A:one"]);
    selected.value = "B";
    await tick();
    expect(trace).toEqual(["A:one", "B:one"]);
    value.value = "two";
    await tick();
    expect(trace.slice(-2)).toEqual(["B:two", "A:two"]);
    selected.value = "";
    await tick();
    value.value = "hidden";
    await tick();
    expect(trace.slice(-1)).toEqual(["A:hidden"]);
    stop();
    value.value = "disposed";
    await tick();
    expect(trace.slice(-1)).toEqual(["A:hidden"]);
  } finally {
    stop();
    target.remove();
  }
});

test("explicitly absent consumer scheduler clears initial inheritance but leaves replacement carrier", () => {
  const seen: boolean[] = [];
  const target = document.createElement("main");
  const stop = render(
    () =>
      h(
        () =>
          withRuneScheduler(() => {
            const consumer = peekComponentContext()!;
            const make = () =>
              createRawSnippet(() => {
                seen.push(Boolean(getRenderScheduler()));
                return { render: () => "<b>ready</b>" };
              });
            return h(
              "section",
              {},
              h(
                () => invokeSnippetDOM(make(), [], consumer, true, undefined),
                {},
              ),
              h(
                () => invokeSnippetDOM(make(), [], consumer, false, undefined),
                {},
              ),
            );
          }),
        {},
      ),
    target,
  );
  try {
    expect(seen).toEqual([false, true]);
  } finally {
    stop();
  }
});
