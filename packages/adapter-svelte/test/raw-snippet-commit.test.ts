import { test, expect } from "bun:test";
import { insertedNode, h as nativeH, render } from "@tschk/moonshine-dom/dom";
import { mapArray } from "@tschk/moonshine-dom/control";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import {
  createRoot,
  createSignal,
  onCleanup,
  getRenderScheduler,
} from "@tschk/moonshine-dom/reactive";
import { createState, createRuneEffect } from "../src/runes";
import { onDestroy, tick } from "../src/svelte";
import { withRuneScheduler } from "../src/pre";
import { createRawSnippet } from "../src/raw-snippet";
import {
  invokeSnippetDOM as bridge,
  createRawSnippetSlot,
} from "../src/raw-snippet-dom";
import "../../react/test/dom";
const authoredScheduler = Symbol("test explicit authored scheduler");
function h(tag: any, props: any, ...children: any[]) {
  return nativeH(
    typeof tag === "function"
      ? (props: any) =>
          withRuneScheduler(() => {
            const consumer = peekComponentContext()!;
            (consumer as any)[authoredScheduler] = getRenderScheduler();
            return tag(props);
          })
      : tag,
    props,
    ...children,
  );
}
function invokeSnippetDOM(
  snippet: any,
  cells: any,
  consumer: any,
  initial: boolean,
) {
  return bridge(snippet, cells, consumer, initial, consumer[authoredScheduler]);
}
test("raw replacement slot matches exact official initial/replacement/later raw/ordinary/optional lifecycle", async () => {
  const fixture = {
    trace: [] as unknown[][],
    apis: {} as Record<
      string,
      { choose(name: string): void; set(value: string): void }
    >,
  };
  function Consumer(props: any) {
    const consumer = peekComponentContext()!,
      slot = createRawSnippetSlot();
    onDestroy(() => fixture.trace.push(["consumer-destroy", props.id]));
    return h(
      "section",
      { "data-case": props.id },
      (() => {
        const mapped = mapArray(
          () => (props.snippet ? [props.snippet] : []),
          (snippet) => {
            const initial = consumer.active;
            return h(
              () =>
                slot.render(() =>
                  invokeSnippetDOM(
                    snippet,
                    [
                      {
                        get value() {
                          return props.value;
                        },
                      },
                    ],
                    consumer,
                    initial,
                  ),
                ),
              {},
            );
          },
          slot.deferRemoved,
        );
        return () => slot.commit(mapped());
      })(),
      h("span", {}, () => props.value),
    );
  }
  function App({ id, empty = false }: any) {
    const value = createState("one");
    const make = (name: string) =>
      createRawSnippet<[string]>((read) => {
        fixture.trace.push(["factory", id, name, read()]);
        return {
          render() {
            fixture.trace.push(["render", id, name, read()]);
            return "<b>" + name + "</b>";
          },
          setup(element) {
            fixture.trace.push(["setup", id, name]);
            createRuneEffect(() => {
              const current = read();
              element.textContent = name + ":" + current;
              fixture.trace.push(["effect", id, name, current]);
              return () =>
                fixture.trace.push(["effect-clean", id, name, current]);
            });
            onDestroy(() => fixture.trace.push(["destroy", id, name]));
            return () =>
              fixture.trace.push(["returned", id, name, element.isConnected]);
          },
        };
      });
    const a = make("A"),
      b = make("B"),
      c = make("C"),
      selected = createState<any>(empty ? undefined : a),
      ordinary = (cell: any) => h("i", {}, () => cell.value);
    fixture.apis[id] = {
      choose(name: string) {
        selected.value =
          name === "A"
            ? a
            : name === "B"
              ? b
              : name === "C"
                ? c
                : name === "ordinary"
                  ? ordinary
                  : undefined;
      },
      set(next: string) {
        value.value = next;
      },
    };
    return h(Consumer, {
      id,
      get snippet() {
        return selected.value;
      },
      get value() {
        return value.value;
      },
    });
  }
  const first = document.createElement("div"),
    second = document.createElement("div");
  document.body.append(first, second);
  const a = render(() => h(App, { id: "initial" }), first),
    b = render(() => h(App, { id: "empty", empty: true }), second);
  const snapshots: Record<string, unknown> = {};
  const record = async (name: string) => {
    await tick();
    snapshots[name] = structuredClone(fixture.trace);
  };
  try {
    await record("initial");
    fixture.apis.initial!.choose("B");
    fixture.apis.empty!.choose("A");
    await record("replace-and-late-mount");
    fixture.apis.initial!.choose("C");
    await record("replace-noninitial");
    fixture.apis.initial!.set("two");
    fixture.apis.empty!.set("two");
    await record("write");
    fixture.apis.initial!.choose("ordinary");
    fixture.apis.empty!.choose("ordinary");
    await record("ordinary");
    fixture.apis.initial!.set("hidden");
    fixture.apis.empty!.set("hidden");
    await record("removed-write");
    fixture.apis.initial!.choose("none");
    fixture.apis.empty!.choose("none");
    await record("undefined");
    a();
    b();
    await record("stopped");
    const expected = [
      ["factory", "initial", "A", "one"],
      ["render", "initial", "A", "one"],
      ["setup", "initial", "A"],
      ["effect", "initial", "A", "one"],
      ["factory", "initial", "B", "one"],
      ["render", "initial", "B", "one"],
      ["setup", "initial", "B"],
      ["returned", "initial", "A", false],
      ["factory", "empty", "A", "one"],
      ["render", "empty", "A", "one"],
      ["setup", "empty", "A"],
      ["effect", "initial", "B", "one"],
      ["effect", "empty", "A", "one"],
      ["factory", "initial", "C", "one"],
      ["render", "initial", "C", "one"],
      ["setup", "initial", "C"],
      ["effect-clean", "initial", "B", "one"],
      ["destroy", "initial", "B"],
      ["returned", "initial", "B", false],
      ["effect", "initial", "C", "one"],
      ["effect-clean", "initial", "C", "one"],
      ["effect", "initial", "C", "two"],
      ["effect-clean", "initial", "A", "one"],
      ["effect", "initial", "A", "two"],
      ["effect-clean", "empty", "A", "one"],
      ["effect", "empty", "A", "two"],
      ["effect-clean", "initial", "C", "two"],
      ["destroy", "initial", "C"],
      ["returned", "initial", "C", false],
      ["effect-clean", "empty", "A", "two"],
      ["destroy", "empty", "A"],
      ["returned", "empty", "A", false],
      ["effect-clean", "initial", "A", "two"],
      ["effect", "initial", "A", "hidden"],
      ["consumer-destroy", "initial"],
      ["effect-clean", "initial", "A", "hidden"],
      ["destroy", "initial", "A"],
      ["consumer-destroy", "empty"],
    ];
    const lengths = {
      initial: 4,
      "replace-and-late-mount": 13,
      "replace-noninitial": 20,
      write: 26,
      ordinary: 32,
      "removed-write": 34,
      undefined: 34,
      stopped: 38,
    };
    for (const [phase, length] of Object.entries(lengths))
      expect(snapshots[phase]).toEqual(expected.slice(0, length));
  } finally {
    a();
    b();
    first.remove();
    second.remove();
  }
});

test("deferred removal callback failure drains every owner and preserves primary error", () => {
  createRoot((dispose) => {
    const stopped: number[] = [];
    const [rows, setRows] = createSignal([1, 2]);
    let retained = () => {};
    const mapped = mapArray(
      rows,
      (item) => {
        onCleanup(() => {
          stopped.push(item);
          throw Error("secondary cleanup");
        });
        return item;
      },
      (stop) => {
        retained = stop;
        throw Error("primary callback");
      },
    );
    mapped();
    expect(() => setRows([])).toThrow("primary callback");
    expect(stopped).toEqual([1, 2]);
    retained();
    dispose();
    expect(stopped).toEqual([1, 2]);
  });
});
test("slot cancellation and factory/setup errors drain queued disposers once", () => {
  createRoot((dispose) => {
    const slot = createRawSnippetSlot(),
      stopped: number[] = [];
    const [rows, setRows] = createSignal([1]);
    const mapped = mapArray(
      rows,
      (item) => {
        onCleanup(() => stopped.push(item));
        return item;
      },
      slot.deferRemoved,
    );
    mapped();
    setRows([2]);
    mapped();
    expect(stopped).toEqual([]);
    dispose();
    dispose();
    expect(stopped).toEqual([1, 2]);
  });
  for (const phase of ["factory", "setup"])
    createRoot((dispose) => {
      const slot = createRawSnippetSlot();
      let stopped = 0;
      slot.deferRemoved(() => {
        stopped++;
        throw Error("old secondary");
      });
      const fail = () => {
        throw Error("primary " + phase);
      };
      if (phase === "factory")
        expect(() => slot.render(fail)).toThrow("primary factory");
      else {
        const node = document.createElement("b");
        Object.defineProperty(node, insertedNode, {
          configurable: true,
          value: fail,
        });
        slot.render(() => node);
        expect(() =>
          (node as Node & { [insertedNode]: () => void })[insertedNode](),
        ).toThrow("primary setup");
      }
      dispose();
      expect(stopped).toBe(1);
    });
});

test("nested ordinary array/thunk setup error retains old output until owner disposal", () => {
  const selected = createState(false),
    trace: string[] = [];
  const target = document.createElement("main");
  let stop = () => {};
  try {
    stop = render(
      () =>
        nativeH(() => {
          const consumer = peekComponentContext()!,
            slot = createRawSnippetSlot();
          const first = createRawSnippet(() => ({
            render: () => "<b>A</b>",
            setup() {
              return () => trace.push("old-stop");
            },
          }));
          const failing = createRawSnippet(() => ({
            render: () => "<b>B</b>",
            setup() {
              throw Error("nested setup failure");
            },
          }));
          const ordinary = () => [
            () =>
              nativeH(
                "div",
                {},
                nativeH(
                  () => bridge(failing, [], consumer, false, undefined),
                  {},
                ),
              ),
          ];
          const mapped = mapArray(
            () => [selected.value ? ordinary : first],
            (fn) =>
              nativeH(
                () =>
                  slot.render(() =>
                    bridge(fn, [], consumer, consumer.active, undefined),
                  ),
                {},
              ),
            slot.deferRemoved,
          );
          return nativeH("section", {}, () => slot.commit(mapped()));
        }, {}),
      target,
    );
    expect(() => {
      selected.value = true;
    }).toThrow("nested setup failure");
    expect(target.querySelector("b")?.textContent).toBe("A");
    expect(trace).toEqual([]);
    stop();
    stop();
    expect(trace).toEqual(["old-stop"]);
    expect(target.querySelector("b")).toBeNull();
  } finally {
    stop();
  }
});
