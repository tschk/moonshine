import { expect, test } from "bun:test";
import "../../react/test/dom";
import { h, hNS, render, templateBlock } from "../../dom/src/dom.ts";
import { bindThis } from "../src/binding.ts";
import { createSignal } from "../../dom/src/reactive.ts";
import { Show } from "../../dom/src/control.ts";
import { withRuneScheduler, markRuneSourceEffect } from "../src/pre.ts";
import { keyedEach } from "../src/each.ts";
import { installAction } from "../src/directives.ts";
import { onMount, onDestroy, tick } from "../src/svelte.ts";
const HTML = "http://www.w3.org/1999/xhtml",
  SVG = "http://www.w3.org/2000/svg";
const api = globalThis as any;
api.refTrace = [];
function Refs() {
  return withRuneScheduler(() => {
    let variable: HTMLDivElement | null = null;
    const members = { node: null as HTMLSpanElement | null };
    let svg: SVGSVGElement | null = null;
    const [shown, setShown] = createSignal(true);
    const action = (node: Element) => {
      api.refTrace.push([
        "action",
        node.tagName,
        node.isConnected,
        !!variable,
        !!members.node,
        !!svg,
      ]);
      return {
        destroy() {
          api.refTrace.push([
            "action-destroy",
            node.tagName,
            node.isConnected,
            !!variable,
            !!members.node,
            !!svg,
          ]);
        },
      };
    };
    onMount(() =>
      api.refTrace.push(["mount", !!variable, !!members.node, !!svg]),
    );
    onDestroy(() =>
      api.refTrace.push(["destroy", !!variable, !!members.node, !!svg]),
    );
    api.refApi = {
      tick,
      hide: () => setShown(false),
      show: () => setShown(true),
      takeover() {
        members.node = document.createElement("aside") as any;
      },
      read: () => [
        variable?.tagName ?? null,
        members.node?.tagName ?? null,
        svg?.tagName ?? null,
      ],
    };
    return Show({
      when: shown,
      children: () => {
        markRuneSourceEffect();
        return templateBlock(() => {
          const div = hNS(HTML, "div");
          bindThis(div, {
            get: () => variable,
            set: (value) => {
              variable = value;
            },
          });
          installAction(div, action);
          const span = hNS(HTML, "span");
          bindThis(span, {
            get: () => members.node,
            set: (value) => {
              members.node = value;
            },
          });
          installAction(span, action);
          const node = hNS(SVG, "svg");
          bindThis(node, {
            get() {
              api.refTrace.push(["get", !!svg]);
              return svg;
            },
            set(value) {
              api.refTrace.push([
                "set",
                value?.tagName ?? null,
                value?.isConnected ?? false,
              ]);
              svg = value;
            },
          });
          installAction(node, action);
          return [div, span, node];
        });
      },
    });
  });
}
function Indexed() {
  return withRuneScheduler(() => {
    const [rows, setRows] = createSignal([{ id: "a" }, { id: "b" }]);
    const cells = new Proxy({} as Record<number, HTMLElement | null>, {
      get(target, key) {
        const node = Reflect.get(target, key);
        if (typeof key === "string")
          api.refTrace.push(["get", key, node?.dataset?.id ?? null]);
        return node;
      },
      set(target, key, node) {
        api.refTrace.push([
          "set",
          String(key),
          node?.dataset?.id ?? null,
          node?.isConnected ?? false,
        ]);
        return Reflect.set(target, key, node);
      },
    });
    const action = (node: HTMLElement) => {
      api.refTrace.push(["action", node.dataset.id, node.isConnected]);
      return {
        destroy() {
          api.refTrace.push([
            "action-destroy",
            node.dataset.id,
            node.isConnected,
          ]);
        },
      };
    };
    onDestroy(() => api.refTrace.push(["destroy"]));
    api.refApi = {
      tick,
      reorder() {
        setRows([rows()[1]!, rows()[0]!]);
      },
      remove() {
        setRows(rows().filter((row) => row.id !== "a"));
      },
      restore() {
        setRows([{ id: "a" }, { id: "b" }]);
      },
      takeover() {
        const node = document.createElement("aside");
        node.dataset.id = "takeover";
        cells[0] = node;
      },
      read() {
        return Object.keys(cells).map((key) => [
          key,
          cells[Number(key)]?.tagName ?? null,
          cells[Number(key)]?.dataset.id ?? null,
          cells[Number(key)]?.isConnected ?? false,
        ]);
      },
    };
    return keyedEach(
      rows,
      (row) => row.id,
      (row, index) => {
        markRuneSourceEffect();
        return templateBlock(() => {
          const node = hNS(
            HTML,
            "span",
            { "data-id": row().id },
            () => row().id,
          );
          bindThis(node, {
            parts: () => [index()] as const,
            get: (i) => cells[i],
            set: (value, i) => {
              cells[i] = value;
            },
          });
          installAction(node, action);
          return node;
        });
      },
    );
  });
}

test("pinned refs complete phases via explicit native source markers", async () => {
  api.refTrace = [];
  const stop = render(() => h(Refs, {}), document.body);
  await tick();
  const records = [];
  for (const phase of ["initial", "takeover", "hide", "show", "dispose"]) {
    if (phase === "dispose") stop();
    else if (phase !== "initial") api.refApi[phase]();
    await tick();
    records.push({
      phase,
      refs: api.refApi.read(),
      trace: api.refTrace.slice(),
      nodes: [...document.body.querySelectorAll("div,span,svg")].map((n) => [
        n.tagName,
        n.namespaceURI,
      ]),
    });
  }
  expect(records).toEqual([
    {
      phase: "initial",
      refs: ["DIV", "SPAN", "svg"],
      trace: [
        ["action", "DIV", true, true, false, false],
        ["action", "SPAN", true, true, true, false],
        ["get", false],
        ["set", "svg", true],
        ["action", "svg", true, true, true, true],
        ["mount", true, true, true],
      ],
      nodes: [
        ["DIV", "http://www.w3.org/1999/xhtml"],
        ["SPAN", "http://www.w3.org/1999/xhtml"],
        ["svg", "http://www.w3.org/2000/svg"],
      ],
    },
    {
      phase: "takeover",
      refs: ["DIV", "ASIDE", "svg"],
      trace: [
        ["action", "DIV", true, true, false, false],
        ["action", "SPAN", true, true, true, false],
        ["get", false],
        ["set", "svg", true],
        ["action", "svg", true, true, true, true],
        ["mount", true, true, true],
      ],
      nodes: [
        ["DIV", "http://www.w3.org/1999/xhtml"],
        ["SPAN", "http://www.w3.org/1999/xhtml"],
        ["svg", "http://www.w3.org/2000/svg"],
      ],
    },
    {
      phase: "hide",
      refs: [null, "ASIDE", null],
      trace: [
        ["action", "DIV", true, true, false, false],
        ["action", "SPAN", true, true, true, false],
        ["get", false],
        ["set", "svg", true],
        ["action", "svg", true, true, true, true],
        ["mount", true, true, true],
        ["action-destroy", "DIV", false, true, true, true],
        ["action-destroy", "SPAN", false, true, true, true],
        ["action-destroy", "svg", false, true, true, true],
        ["get", true],
        ["set", null, false],
      ],
      nodes: [],
    },
    {
      phase: "show",
      refs: ["DIV", "SPAN", "svg"],
      trace: [
        ["action", "DIV", true, true, false, false],
        ["action", "SPAN", true, true, true, false],
        ["get", false],
        ["set", "svg", true],
        ["action", "svg", true, true, true, true],
        ["mount", true, true, true],
        ["action-destroy", "DIV", false, true, true, true],
        ["action-destroy", "SPAN", false, true, true, true],
        ["action-destroy", "svg", false, true, true, true],
        ["get", true],
        ["set", null, false],
        ["action", "DIV", true, true, true, false],
        ["action", "SPAN", true, true, true, false],
        ["get", false],
        ["set", "svg", true],
        ["action", "svg", true, true, true, true],
      ],
      nodes: [
        ["DIV", "http://www.w3.org/1999/xhtml"],
        ["SPAN", "http://www.w3.org/1999/xhtml"],
        ["svg", "http://www.w3.org/2000/svg"],
      ],
    },
    {
      phase: "dispose",
      refs: [null, null, null],
      trace: [
        ["action", "DIV", true, true, false, false],
        ["action", "SPAN", true, true, true, false],
        ["get", false],
        ["set", "svg", true],
        ["action", "svg", true, true, true, true],
        ["mount", true, true, true],
        ["action-destroy", "DIV", false, true, true, true],
        ["action-destroy", "SPAN", false, true, true, true],
        ["action-destroy", "svg", false, true, true, true],
        ["get", true],
        ["set", null, false],
        ["action", "DIV", true, true, true, false],
        ["action", "SPAN", true, true, true, false],
        ["get", false],
        ["set", "svg", true],
        ["action", "svg", true, true, true, true],
        ["action-destroy", "DIV", false, true, true, true],
        ["action-destroy", "SPAN", false, true, true, true],
        ["action-destroy", "svg", false, true, true, true],
        ["destroy", true, true, true],
        ["get", true],
        ["set", null, false],
      ],
      nodes: [],
    },
  ]);
  stop();
  document.body.replaceChildren();
});

test("pinned indexed complete phases via explicit native source markers", async () => {
  api.refTrace = [];
  const stop = render(() => h(Indexed, {}), document.body);
  await tick();
  const original = [...document.querySelectorAll("span")];
  const records = [];
  for (const phase of [
    "initial",
    "reorder",
    "takeover",
    "remove",
    "restore",
    "dispose",
  ]) {
    if (phase === "dispose") stop();
    else if (phase !== "initial") api.refApi[phase]();
    await tick();
    const trace = api.refTrace.slice(),
      refs = api.refApi.read();
    records.push({
      phase,
      refs,
      trace,
      nodes: [...document.querySelectorAll("span")].map(
        (n) => (n as HTMLElement).dataset.id,
      ),
    });
    if (phase === "reorder") {
      expect(document.querySelectorAll("span")[1]).toBe(original[0]);
      expect(document.querySelectorAll("span")[0]).toBe(original[1]);
    }
  }
  expect(records).toEqual([
    {
      phase: "initial",
      refs: [
        ["0", "SPAN", "a", true],
        ["1", "SPAN", "b", true],
      ],
      trace: [
        ["get", "0", null],
        ["set", "0", "a", true],
        ["action", "a", true],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["action", "b", true],
      ],
      nodes: ["a", "b"],
    },
    {
      phase: "reorder",
      refs: [
        ["0", "SPAN", "b", true],
        ["1", "SPAN", "a", true],
      ],
      trace: [
        ["get", "0", null],
        ["set", "0", "a", true],
        ["action", "a", true],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["action", "b", true],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "0", "a"],
        ["set", "0", "b", true],
        ["get", "1", "b"],
        ["set", "1", null, false],
        ["get", "1", null],
        ["set", "1", "a", true],
        ["get", "0", "b"],
      ],
      nodes: ["b", "a"],
    },
    {
      phase: "takeover",
      refs: [
        ["0", "ASIDE", "takeover", false],
        ["1", "SPAN", "a", true],
      ],
      trace: [
        ["get", "0", null],
        ["set", "0", "a", true],
        ["action", "a", true],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["action", "b", true],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "0", "a"],
        ["set", "0", "b", true],
        ["get", "1", "b"],
        ["set", "1", null, false],
        ["get", "1", null],
        ["set", "1", "a", true],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["set", "0", "takeover", false],
      ],
      nodes: ["b", "a"],
    },
    {
      phase: "remove",
      refs: [
        ["0", "ASIDE", "takeover", false],
        ["1", null, null, false],
      ],
      trace: [
        ["get", "0", null],
        ["set", "0", "a", true],
        ["action", "a", true],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["action", "b", true],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "0", "a"],
        ["set", "0", "b", true],
        ["get", "1", "b"],
        ["set", "1", null, false],
        ["get", "1", null],
        ["set", "1", "a", true],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["set", "0", "takeover", false],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["action-destroy", "a", false],
        ["get", "1", "a"],
        ["set", "1", null, false],
      ],
      nodes: ["b"],
    },
    {
      phase: "restore",
      refs: [
        ["0", "SPAN", "a", true],
        ["1", "SPAN", "b", true],
      ],
      trace: [
        ["get", "0", null],
        ["set", "0", "a", true],
        ["action", "a", true],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["action", "b", true],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "0", "a"],
        ["set", "0", "b", true],
        ["get", "1", "b"],
        ["set", "1", null, false],
        ["get", "1", null],
        ["set", "1", "a", true],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["set", "0", "takeover", false],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["action-destroy", "a", false],
        ["get", "1", "a"],
        ["set", "1", null, false],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "1", null],
        ["get", "1", null],
        ["get", "1", null],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["set", "0", "a", true],
        ["action", "a", true],
      ],
      nodes: ["a", "b"],
    },
    {
      phase: "dispose",
      refs: [
        ["0", null, null, false],
        ["1", null, null, false],
      ],
      trace: [
        ["get", "0", null],
        ["set", "0", "a", true],
        ["action", "a", true],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["action", "b", true],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "0", "a"],
        ["set", "0", "b", true],
        ["get", "1", "b"],
        ["set", "1", null, false],
        ["get", "1", null],
        ["set", "1", "a", true],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "0", "b"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["set", "0", "takeover", false],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["get", "1", "a"],
        ["action-destroy", "a", false],
        ["get", "1", "a"],
        ["set", "1", null, false],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["get", "1", null],
        ["get", "1", null],
        ["get", "1", null],
        ["get", "1", null],
        ["set", "1", "b", true],
        ["get", "0", "takeover"],
        ["get", "0", "takeover"],
        ["set", "0", "a", true],
        ["action", "a", true],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "0", "a"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["get", "1", "b"],
        ["action-destroy", "a", false],
        ["action-destroy", "b", false],
        ["destroy"],
        ["get", "1", "b"],
        ["set", "1", null, false],
        ["get", "0", "a"],
        ["set", "0", null, false],
      ],
      nodes: [],
    },
  ]);
  stop();
  document.body.replaceChildren();
});

import {
  createComponentScope,
  getRenderScheduler,
} from "@tschk/moonshine-dom/reactive";
function stableShow<T, U>(props: {
  when: () => T;
  children: (value: () => NonNullable<T>) => U;
}) {
  const scheduler = getRenderScheduler()!;
  return createComponentScope(() => scheduler.branch(() => Show(props)));
}
function nestedStableApp(trace: unknown[][], expose: (value: any) => void) {
  const refs: Record<string, Element | null> = {};
  const [shown, setShown] = createSignal(true);
  const [rows, setRows] = createSignal([{ id: "a" }, { id: "b" }]);
  const get = (key: string) => {
    trace.push(["get", key, refs[key]?.tagName ?? null]);
    return refs[key];
  };
  const set = (key: string, node: Element | null) => {
    trace.push(["set", key, node?.tagName ?? null, node?.isConnected ?? false]);
    refs[key] = node;
  };
  const action = (node: Element, key: string) => {
    trace.push(["action", key, node.isConnected]);
    return {
      destroy() {
        trace.push(["action-destroy", key, node.isConnected, !!refs[key]]);
      },
    };
  };
  function bound(tag: string, key: string, children?: any) {
    const node = hNS(HTML, tag as "div", {}, children);
    bindThis(node, { get: () => get(key), set: (value) => set(key, value) });
    installAction(node, action, () => key);
    return node;
  }
  function Child() {
    onDestroy(() =>
      trace.push([
        "destroy",
        "child",
        Object.keys(refs).filter((key) => !!refs[key]),
      ]),
    );
    return withRuneScheduler(() =>
      templateBlock(() => [bound("span", "left"), bound("b", "right")]),
    );
  }
  function Parent() {
    onDestroy(() =>
      trace.push([
        "destroy",
        "parent",
        Object.keys(refs).filter((key) => !!refs[key]),
      ]),
    );
    expose({
      hide: () => setShown(false),
      show: () => setShown(true),
      reorder: () => setRows([rows()[1]!, rows()[0]!]),
      refs: () =>
        Object.fromEntries(
          Object.entries(refs).map(([key, node]) => [
            key,
            node?.tagName ?? null,
          ]),
        ),
    });
    return withRuneScheduler(() =>
      templateBlock(() =>
        bound(
          "div",
          "parent",
          stableShow({
            when: shown,
            children: () => {
              markRuneSourceEffect();
              return [
                h(Child, {}),
                keyedEach(
                  rows,
                  (row) => row.id,
                  (row) => {
                    markRuneSourceEffect();
                    return templateBlock(() => bound("i", row().id, row().id));
                  },
                ),
              ];
            },
          }),
        ),
      ),
    );
  }
  return Parent;
}

test("pinned stable-container nested direct-stop exact records", async () => {
  const trace: unknown[][] = [];
  let nestedApi: any;
  const Parent = nestedStableApp(trace, (v) => (nestedApi = v));
  const stop = render(() => h(Parent, {}), document.body);
  const records = [];
  for (const phase of ["initial", "stop"]) {
    if (phase === "stop") stop();
    else if (phase !== "initial") nestedApi[phase]();
    await tick();
    records.push({
      phase,
      trace: trace.slice(),
      refs: nestedApi.refs(),
      nodes: [...document.querySelectorAll("div,span,b,i")].map(
        (n) => n.tagName,
      ),
    });
  }
  expect(records).toEqual([
    {
      phase: "initial",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
      ],
      refs: { left: "SPAN", right: "B", a: "I", b: "I", parent: "DIV" },
      nodes: ["DIV", "SPAN", "B", "I", "I"],
    },
    {
      phase: "stop",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "a", false, true],
        ["action-destroy", "b", false, true],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
        ["action-destroy", "parent", false, true],
        ["destroy", "parent", ["a", "b", "parent"]],
        ["get", "parent", "DIV"],
        ["set", "parent", null, false],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "a", "I"],
        ["set", "a", null, false],
      ],
      refs: { left: null, right: null, a: null, b: null, parent: null },
      nodes: [],
    },
  ]);
  stop();
  document.body.replaceChildren();
});

test("pinned stable-container nested hide-show-stop exact records", async () => {
  const trace: unknown[][] = [];
  let nestedApi: any;
  const Parent = nestedStableApp(trace, (v) => (nestedApi = v));
  const stop = render(() => h(Parent, {}), document.body);
  const records = [];
  for (const phase of ["initial", "hide", "show", "stop"]) {
    if (phase === "stop") stop();
    else if (phase !== "initial") nestedApi[phase]();
    await tick();
    records.push({
      phase,
      trace: trace.slice(),
      refs: nestedApi.refs(),
      nodes: [...document.querySelectorAll("div,span,b,i")].map(
        (n) => n.tagName,
      ),
    });
  }
  expect(records).toEqual([
    {
      phase: "initial",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
      ],
      refs: { left: "SPAN", right: "B", a: "I", b: "I", parent: "DIV" },
      nodes: ["DIV", "SPAN", "B", "I", "I"],
    },
    {
      phase: "hide",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "a", false, true],
        ["action-destroy", "b", false, true],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "a", "I"],
        ["set", "a", null, false],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
      ],
      refs: { left: null, right: null, a: null, b: null, parent: "DIV" },
      nodes: ["DIV"],
    },
    {
      phase: "show",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "a", false, true],
        ["action-destroy", "b", false, true],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "a", "I"],
        ["set", "a", null, false],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
      ],
      refs: { left: "SPAN", right: "B", a: "I", b: "I", parent: "DIV" },
      nodes: ["DIV", "SPAN", "B", "I", "I"],
    },
    {
      phase: "stop",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "a", false, true],
        ["action-destroy", "b", false, true],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "a", "I"],
        ["set", "a", null, false],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "a", false, true],
        ["action-destroy", "b", false, true],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
        ["action-destroy", "parent", false, true],
        ["destroy", "parent", ["a", "b", "parent"]],
        ["get", "parent", "DIV"],
        ["set", "parent", null, false],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "a", "I"],
        ["set", "a", null, false],
      ],
      refs: { left: null, right: null, a: null, b: null, parent: null },
      nodes: [],
    },
  ]);
  stop();
  document.body.replaceChildren();
});

test("pinned stable-container nested reorder-hide-show-stop exact records", async () => {
  const trace: unknown[][] = [];
  let nestedApi: any;
  const Parent = nestedStableApp(trace, (v) => (nestedApi = v));
  const stop = render(() => h(Parent, {}), document.body);
  const records = [];
  for (const phase of ["initial", "reorder", "hide", "show", "stop"]) {
    if (phase === "stop") stop();
    else if (phase !== "initial") nestedApi[phase]();
    await tick();
    records.push({
      phase,
      trace: trace.slice(),
      refs: nestedApi.refs(),
      nodes: [...document.querySelectorAll("div,span,b,i")].map(
        (n) => n.tagName,
      ),
    });
  }
  expect(records).toEqual([
    {
      phase: "initial",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
      ],
      refs: { left: "SPAN", right: "B", a: "I", b: "I", parent: "DIV" },
      nodes: ["DIV", "SPAN", "B", "I", "I"],
    },
    {
      phase: "reorder",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
      ],
      refs: { left: "SPAN", right: "B", a: "I", b: "I", parent: "DIV" },
      nodes: ["DIV", "SPAN", "B", "I", "I"],
    },
    {
      phase: "hide",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "b", false, true],
        ["action-destroy", "a", false, true],
        ["get", "a", "I"],
        ["set", "a", null, false],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
      ],
      refs: { left: null, right: null, a: null, b: null, parent: "DIV" },
      nodes: ["DIV"],
    },
    {
      phase: "show",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "b", false, true],
        ["action-destroy", "a", false, true],
        ["get", "a", "I"],
        ["set", "a", null, false],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
      ],
      refs: { left: "SPAN", right: "B", a: "I", b: "I", parent: "DIV" },
      nodes: ["DIV", "SPAN", "B", "I", "I"],
    },
    {
      phase: "stop",
      trace: [
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "parent", null],
        ["set", "parent", "DIV", true],
        ["action", "parent", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "b", false, true],
        ["action-destroy", "a", false, true],
        ["get", "a", "I"],
        ["set", "a", null, false],
        ["get", "b", "I"],
        ["set", "b", null, false],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
        ["get", "left", null],
        ["set", "left", "SPAN", true],
        ["action", "left", true],
        ["get", "right", null],
        ["set", "right", "B", true],
        ["action", "right", true],
        ["get", "b", null],
        ["set", "b", "I", true],
        ["action", "b", true],
        ["get", "a", null],
        ["set", "a", "I", true],
        ["action", "a", true],
        ["action-destroy", "left", false, true],
        ["action-destroy", "right", false, true],
        ["destroy", "child", ["left", "right", "a", "b", "parent"]],
        ["action-destroy", "b", false, true],
        ["action-destroy", "a", false, true],
        ["get", "right", "B"],
        ["set", "right", null, false],
        ["get", "left", "SPAN"],
        ["set", "left", null, false],
        ["action-destroy", "parent", false, true],
        ["destroy", "parent", ["a", "b", "parent"]],
        ["get", "parent", "DIV"],
        ["set", "parent", null, false],
        ["get", "a", "I"],
        ["set", "a", null, false],
        ["get", "b", "I"],
        ["set", "b", null, false],
      ],
      refs: { left: null, right: null, a: null, b: null, parent: null },
      nodes: [],
    },
  ]);
  stop();
  document.body.replaceChildren();
});
