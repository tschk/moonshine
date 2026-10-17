import { afterEach, expect, test } from "bun:test";
import { h, hNS, render, templateBlock } from "@tschk/moonshine-dom/dom";
import { bindThis } from "../src/binding";
import { createRoot, createSignal } from "@tschk/moonshine-dom/reactive";
import { withRuneScheduler } from "../src/pre";
import { installAction } from "../src/directives";
import { onDestroy, tick } from "../src/svelte";
import "../../react/test/dom";

const HTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";
let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

test("element references publish per node before actions and clear after teardown", async () => {
  let div: HTMLDivElement | null = null;
  let span: HTMLSpanElement | null = null;
  let svg: SVGSVGElement | null = null;
  const trace: unknown[][] = [];
  function App() {
    onDestroy(() => trace.push(["destroy", !!div, !!span, !!svg]));
    return withRuneScheduler(() =>
      templateBlock(() => {
        function action(node: Element) {
          trace.push([
            "action",
            node.tagName,
            node.isConnected,
            !!div,
            !!span,
            !!svg,
          ]);
          return {
            destroy() {
              trace.push([
                "action-destroy",
                node.tagName,
                node.isConnected,
                !!div,
                !!span,
                !!svg,
              ]);
            },
          };
        }
        const d = hNS(HTML, "div");
        bindThis(d, {
          get: () => div,
          set: (value) => {
            div = value;
            trace.push(["set", "DIV", !!value, value?.isConnected ?? false]);
          },
        });
        installAction(d, action);
        const s = hNS(HTML, "span");
        bindThis(s, {
          get: () => span,
          set: (value) => {
            span = value;
            trace.push(["set", "SPAN", !!value, value?.isConnected ?? false]);
          },
        });
        installAction(s, action);
        const v = hNS(SVG, "svg");
        bindThis(v, {
          get: () => svg,
          set: (value) => {
            svg = value;
            trace.push(["set", "svg", !!value, value?.isConnected ?? false]);
          },
        });
        installAction(v, action);
        return [d, s, v];
      }),
    );
  }
  stop = render(() => h(App, {}), document.body);
  await tick();
  expect(trace).toEqual([
    ["set", "DIV", true, true],
    ["action", "DIV", true, true, false, false],
    ["set", "SPAN", true, true],
    ["action", "SPAN", true, true, true, false],
    ["set", "svg", true, true],
    ["action", "svg", true, true, true, true],
  ]);
  stop();
  expect(trace.filter((entry) => entry[0] === "action-destroy")).toEqual([
    ["action-destroy", "DIV", false, true, true, true],
    ["action-destroy", "SPAN", false, true, true, true],
    ["action-destroy", "svg", false, true, true, true],
  ]);
  expect(trace.find((entry) => entry[0] === "destroy")).toEqual([
    "destroy",
    true,
    true,
    true,
  ]);
  expect([div, span, svg]).toEqual([null, null, null]);
});

test("captured parts move references and preserve a replacement target on stop", async () => {
  const [index, setIndex] = createSignal(0);
  const cells: Record<number, HTMLSpanElement | null> = {};
  let node!: HTMLSpanElement;
  function App() {
    return withRuneScheduler(() =>
      templateBlock(() => {
        node = hNS(HTML, "span");
        bindThis(node, {
          parts: () => [index()] as const,
          get: (i) => cells[i],
          set: (value, i) => {
            cells[i] = value;
          },
        });
        return node;
      }),
    );
  }
  stop = render(() => h(App, {}), document.body);
  await tick();
  expect(cells[0]).toBe(node);
  setIndex(1);
  await tick();
  expect(cells[0]).toBe(null);
  expect(cells[1]).toBe(node);
  const replacement = document.createElement("span");
  cells[1] = replacement;
  stop();
  expect(cells[1]).toBe(replacement);
});

test("stopped queued references never publish", async () => {
  const writes: unknown[] = [];
  createRoot((dispose) => {
    withRuneScheduler(() =>
      bindThis(hNS(HTML, "div"), {
        get: () => null,
        set: (value) => writes.push(value),
      }),
    );
    dispose();
  });
  await tick();
  expect(writes).toEqual([]);
});

test("the public installer rejects absent owners and absent schedulers", () => {
  expect(() =>
    bindThis(hNS(HTML, "div"), { get: () => null, set() {} }),
  ).toThrow("live native owner");
  createRoot((dispose) => {
    expect(() =>
      bindThis(hNS(HTML, "div"), { get: () => null, set() {} }),
    ).toThrow("render scheduler");
    dispose();
  });
});

test("source branch retirement uses branch LIFO while full stop respects static child cap", async () => {
  const { Show } = await import("@tschk/moonshine-dom/control");
  const { markRuneSourceEffect } = await import("../src/pre");
  const [visible, show] = createSignal(true);
  const trace: string[] = [];
  const cells: Record<string, Element | null> = {};
  function bound(name: string) {
    const element = hNS(HTML, "span");
    bindThis(element, {
      get: () => cells[name],
      set(value) {
        cells[name] = value;
        trace.push(`${name}:${value ? "set" : "clear"}`);
      },
    });
    return element;
  }
  function Child() {
    onDestroy(() => trace.push(`child:${!!cells.left}:${!!cells.right}`));
    return withRuneScheduler(() =>
      templateBlock(() => [bound("left"), bound("right")]),
    );
  }
  function App() {
    onDestroy(() =>
      trace.push(`parent:${!!cells.left}:${!!cells.right}:${!!cells.row}`),
    );
    return withRuneScheduler(() =>
      templateBlock(() =>
        hNS(
          HTML,
          "section",
          {},
          Show({
            when: visible,
            children: () => {
              markRuneSourceEffect();
              return [h(Child, {}), bound("row")];
            },
          }),
        ),
      ),
    );
  }
  stop = render(() => h(App, {}), document.body);
  await tick();
  trace.length = 0;
  show(false);
  await tick();
  expect(trace).toEqual([
    "child:true:true",
    "row:clear",
    "right:clear",
    "left:clear",
  ]);
  show(true);
  await tick();
  trace.length = 0;
  stop();
  expect(trace).toEqual([
    "child:true:true",
    "right:clear",
    "left:clear",
    "parent:false:false:true",
    "row:clear",
  ]);
});

test("mount-style outer scheduler and inner scheduler retain root cleanup ordering", async () => {
  let cell: Element | null = null;
  const trace: boolean[] = [];
  function App() {
    onDestroy(() => trace.push(!!cell));
    return withRuneScheduler(() =>
      templateBlock(() => {
        const element = hNS(HTML, "div");
        bindThis(element, {
          get: () => cell,
          set(value) {
            cell = value;
          },
        });
        return element;
      }),
    );
  }
  stop = render(() => withRuneScheduler(() => h(App, {})), document.body);
  await tick();
  stop();
  expect(trace).toEqual([true]);
  expect(cell).toBeNull();
});

test("a setter disposing its source clears its late target through commit fallback", async () => {
  let cell: Element | null = null;
  const writes: boolean[] = [];
  let ignored = 0;
  function App() {
    return withRuneScheduler(() =>
      templateBlock(() => {
        const element = hNS(HTML, "span");
        const reference = {
          get: () => cell,
          set(value: Element | null) {
            cell = value;
            writes.push(!!value);
            if (value) stop();
          },
          // Authored descriptor extras never become the internal cleanup policy.
          enqueueClear() {
            ignored++;
          },
        };
        bindThis(element, reference);
        return element;
      }),
    );
  }
  stop = render(() => h(App, {}), document.body);
  await tick();
  expect(writes).toEqual([true, false]);
  expect(cell).toBeNull();
  expect(ignored).toBe(0);
  stop();
  expect(writes).toEqual([true, false]);
});
