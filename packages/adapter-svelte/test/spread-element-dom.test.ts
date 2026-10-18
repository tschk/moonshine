import { expect, spyOn, test } from "bun:test";
import { createRoot, createSignal } from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { withRuneScheduler } from "@tschk/moonshine-svelte/pre";
import { installElementSpread } from "../src/spread-element-dom";
import "../../react/test/dom";

function mount(element: Element, ...layers: unknown[]): () => void {
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => installElementSpread(element, ...layers));
  });
  return stop;
}

test("case-variant raw keys keep update and removal order", async () => {
  const element = document.createElement("button");
  const [read, set] = createSignal<Record<string, unknown>>({
    Title: "a",
    title: "b",
  });
  const stop = mount(element, read);
  expect(element.title).toBe("b");
  set({ Title: "changed" });
  await Promise.resolve();
  expect(element.hasAttribute("title")).toBe(false);
  set({ class: "a", Class: "b" });
  await Promise.resolve();
  expect(element.className).toBe("b");
  set({ Class: "b" });
  await Promise.resolve();
  expect(element.hasAttribute("class")).toBe(false);
  stop();
});

test("mixed-case event-like keys never become inline handler attributes", () => {
  const element = document.createElement("button");
  const stop = mount(element, {
    Onclick: "inline()",
    ONFOCUS: "inline()",
    on: "reserved",
    title: "safe",
  });
  expect(element.hasAttribute("onclick")).toBe(false);
  expect(element.hasAttribute("onfocus")).toBe(false);
  expect(element.hasAttribute("on")).toBe(false);
  expect(element.title).toBe("safe");
  stop();
});

test("spread snapshots read enumerable symbol getters and function-object fields without calling data", () => {
  let getters = 0,
    calls = 0;
  const data = Object.assign(() => calls++, { title: "function data" });
  const symbol = Symbol("ignored attribute");
  Object.defineProperty(data, symbol, {
    enumerable: true,
    get() {
      getters++;
      return "ignored";
    },
  });
  const element = document.createElement("button");
  const stop = mount(element, () => data);
  expect(element.title).toBe("function data");
  expect(getters).toBe(1);
  expect(calls).toBe(0);
  stop();
});

test("attribute updates retain strict equality and the present-undefined exception", async () => {
  const element = document.createElement("button");
  const writes = spyOn(element, "setAttribute");
  const [read, update] = createSignal<Record<string, unknown>>({
    "data-number": NaN,
    title: undefined,
  });
  const stop = mount(element, read);
  expect(
    writes.mock.calls.filter(([key]) => key === "data-number"),
  ).toHaveLength(1);
  element.setAttribute("title", "external");
  update({ "data-number": NaN, title: undefined });
  await Promise.resolve();
  expect(
    writes.mock.calls.filter(([key]) => key === "data-number"),
  ).toHaveLength(2);
  expect(element.hasAttribute("title")).toBe(false);
  update({ "data-number": -0, title: null });
  await Promise.resolve();
  const count = writes.mock.calls.length;
  element.setAttribute("title", "retained external null");
  update({ "data-number": 0, title: null });
  await Promise.resolve();
  expect(writes.mock.calls).toHaveLength(count + 1);
  expect(element.title).toBe("retained external null");
  stop();
  writes.mockRestore();
});

test("layers merge in order, getters and thunks run once per update, absent keys are removed", async () => {
  const [id, setId] = createSignal("a"),
    [extra, setExtra] = createSignal(true);
  const div = document.createElement("div");
  div.setAttribute("data-template", "keep");
  let thunks = 0,
    getters = 0;
  const stop = mount(
    div,
    () => {
      thunks++;
      return {
        id: id(),
        title: "base",
        get "data-count"() {
          getters++;
          return 1;
        },
        ...(extra() ? { "data-extra": "x" } : {}),
      };
    },
    null,
    { title: "later", "data-count": 2 },
  );
  expect(div.getAttribute("id")).toBe("a");
  await Promise.resolve();
  expect([thunks, getters]).toEqual([1, 1]);
  expect(div.getAttribute("id")).toBe("a");
  expect(div.getAttribute("title")).toBe("later");
  expect(div.getAttribute("data-count")).toBe("2");
  expect(div.getAttribute("data-extra")).toBe("x");
  expect(div.getAttribute("data-template")).toBe("keep");
  setId("b");
  setExtra(false);
  await Promise.resolve();
  expect([thunks, getters]).toEqual([2, 2]);
  expect(div.getAttribute("id")).toBe("b");
  expect(div.hasAttribute("data-extra")).toBe(false);
  expect(div.getAttribute("data-template")).toBe("keep");
  stop();
});

test("booleans, translate, class and style follow source semantics; functions, symbols and $$ keys are ignored", async () => {
  const [on, setOn] = createSignal(true);
  const div = document.createElement("div");
  const marker = Symbol("m");
  let called = 0;
  const stop = mount(div, () => ({
    hidden: on(),
    inert: on(),
    translate: on(),
    "aria-hidden": on(),
    class: ["a", { b: on(), c: false }],
    style: on() ? "color: red" : 7,
    ref: () => called++,
    $$internal: "x",
    [marker]: "y",
  }));
  await Promise.resolve();
  expect(div.getAttribute("hidden")).toBe("");
  expect(div.getAttribute("inert")).toBe("");
  expect(div.getAttribute("translate")).toBe("yes");
  expect(div.getAttribute("aria-hidden")).toBe("true");
  expect(div.getAttribute("class")).toBe("a b");
  expect(div.style.cssText).toBe("color: red;");
  expect(div.hasAttribute("ref")).toBe(false);
  expect(div.hasAttribute("$$internal")).toBe(false);
  expect(called).toBe(0);
  setOn(false);
  await Promise.resolve();
  expect(div.hasAttribute("hidden")).toBe(false);
  expect(div.hasAttribute("inert")).toBe(false);
  expect(div.getAttribute("translate")).toBe("no");
  expect(div.getAttribute("aria-hidden")).toBe("false");
  expect(div.getAttribute("class")).toBe("a");
  stop();
});

test("class resolving to nothing removes the attribute and nullish values remove template attributes", async () => {
  const [on, setOn] = createSignal(true);
  const div = document.createElement("div");
  div.setAttribute("title", "template");
  const stop = mount(div, () => ({
    class: on() ? "x" : [false, null],
    title: on() ? "t" : undefined,
  }));
  await Promise.resolve();
  expect([div.getAttribute("class"), div.getAttribute("title")]).toEqual([
    "x",
    "t",
  ]);
  setOn(false);
  await Promise.resolve();
  expect(div.hasAttribute("class")).toBe(false);
  expect(div.hasAttribute("title")).toBe(false);
  stop();
});

test("nonstring values use host property setters while strings stay attributes", async () => {
  const img = document.createElement("img");
  const stop = mount(img, { width: 12, alt: "a" });
  await Promise.resolve();
  expect(img.width).toBe(12);
  expect(img.getAttribute("alt")).toBe("a");
  stop();
});

test("event handlers swap without relistening, keep element this, capture and remove on nullish, absent or dispose", async () => {
  const [handler, setHandler] = createSignal<{ fn: () => void } | null>(null);
  const [capture, setCapture] = createSignal(true);
  const div = document.createElement("div");
  const child = document.createElement("span");
  div.append(child);
  const trace: unknown[] = [];
  const add = spyOn(div, "addEventListener"),
    remove = spyOn(div, "removeEventListener");
  const first = function (this: unknown) {
    trace.push(["first", this === div]);
  };
  const second = () => trace.push("second");
  setHandler({ fn: first });
  const stop = mount(div, () => ({
    onclick: handler()?.fn,
    ...(capture() ? { onclickcapture: () => trace.push("capture") } : {}),
    onPing: () => trace.push("Ping"),
  }));
  await Promise.resolve();
  expect(add).toHaveBeenCalledTimes(3);
  div.dispatchEvent(new Event("click"));
  expect(trace).toEqual(["capture", ["first", true]]);
  div.dispatchEvent(new Event("Ping"));
  div.dispatchEvent(new Event("ping"));
  expect(trace.slice(2)).toEqual(["Ping"]);
  trace.length = 0;
  setHandler({ fn: second });
  await Promise.resolve();
  expect(add).toHaveBeenCalledTimes(3);
  expect(remove).toHaveBeenCalledTimes(0);
  child.dispatchEvent(new Event("click", { bubbles: true }));
  expect(trace).toEqual(["capture", "second"]);
  trace.length = 0;
  setCapture(false);
  await Promise.resolve();
  expect(remove).toHaveBeenCalledTimes(1);
  child.dispatchEvent(new Event("click", { bubbles: true }));
  expect(trace).toEqual(["second"]);
  trace.length = 0;
  stop();
  expect(remove).toHaveBeenCalledTimes(3);
  child.dispatchEvent(new Event("click", { bubbles: true }));
  div.dispatchEvent(new Event("Ping"));
  expect(trace).toEqual([]);
});

test("nullish handler removes the listener and a later function re-adds it", async () => {
  const [on, setOn] = createSignal(true);
  const div = document.createElement("div");
  let calls = 0;
  const stop = mount(div, () => ({ onclick: on() ? () => calls++ : null }));
  await Promise.resolve();
  div.dispatchEvent(new Event("click"));
  setOn(false);
  await Promise.resolve();
  div.dispatchEvent(new Event("click"));
  expect(calls).toBe(1);
  setOn(true);
  await Promise.resolve();
  div.dispatchEvent(new Event("click"));
  expect(calls).toBe(2);
  stop();
});

test("content keys are rejected before any DOM write", () => {
  const div = document.createElement("div");
  div.textContent = "template";
  expect(() => mount(div, { id: "x", innerHTML: "<b>no</b>" })).toThrow(
    "innerHTML",
  );
  expect(div.textContent).toBe("template");
  expect(div.hasAttribute("id")).toBe(false);
});

test("SSR never evaluates layers and DOM install needs a live owner with a scheduler", () => {
  let calls = 0;
  const layer = () => {
    calls++;
    return {};
  };
  createRoot((dispose) => {
    createComponent(
      () =>
        installElementSpread(null as unknown as Element, layer, {
          get a() {
            calls++;
            return 1;
          },
        }),
      {},
      "ssr",
    );
    dispose();
  });
  expect(calls).toBe(0);
  const div = document.createElement("div");
  expect(() => installElementSpread(div, layer)).toThrow("live owner");
  createRoot((dispose) => {
    expect(() => installElementSpread(div, layer)).toThrow("withRuneScheduler");
    dispose();
  });
  expect(calls).toBe(0);
});
