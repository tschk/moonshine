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

test("input spread keeps live values separate from reset defaults", async () => {
  const input = document.createElement("input");
  const [read, set] = createSignal<Record<string, unknown>>({
    defaultValue: "seed",
    value: "live",
  });
  const stop = mount(input, read);
  expect(input.value).toBe("live");
  expect(input.defaultValue).toBe("seed");
  expect(input.getAttribute("value")).toBe("seed");
  input.value = "typed";
  set({ defaultValue: "seed", value: "live", title: "updated" });
  await Promise.resolve();
  expect(input.value).toBe("typed");
  set({ defaultValue: "seed" });
  await Promise.resolve();
  expect(input.value).toBe("");
  expect(input.defaultValue).toBe("seed");
  expect(input.hasAttribute("__value")).toBe(false);
  stop();
});

test("input spread applies type before live value and checked preserves defaults", async () => {
  const input = document.createElement("input");
  const [read, set] = createSignal<Record<string, unknown>>({
    value: "5",
    type: "number",
  });
  const stop = mount(input, read);
  expect(input.type).toBe("number");
  expect(input.value).toBe("5");
  set({ type: "checkbox", defaultChecked: true, checked: false });
  await Promise.resolve();
  expect(input.checked).toBe(false);
  expect(input.defaultChecked).toBe(true);
  set({ type: "checkbox", defaultChecked: true });
  await Promise.resolve();
  expect(input.checked).toBe(false);
  expect(input.defaultChecked).toBe(true);
  stop();
});

test("textarea spread sets live properties without changing reset text", async () => {
  const element = document.createElement("textarea");
  const [read, set] = createSignal<Record<string, unknown>>({
    defaultValue: "seed",
    value: "live",
  });
  const stop = mount(element, read);
  expect(element.value).toBe("live");
  expect(element.defaultValue).toBe("seed");
  expect(element.hasAttribute("value")).toBe(false);
  set({ defaultValue: "seed" });
  await Promise.resolve();
  expect(element.value).toBe("");
  expect(element.defaultValue).toBe("seed");
  stop();
});

test("option spread retains typed identity for native select bindings", async () => {
  const select = document.createElement("select");
  const option = document.createElement("option");
  option.textContent = "Label";
  select.append(option);
  const identity = { id: 1 };
  const [read, set] = createSignal<Record<string, unknown>>({
    value: identity,
  });
  const stop = mount(option, read);
  let selected: unknown;
  const { bindSelectValue } = await import("../src/binding");
  let dispose!: () => void;
  createRoot((end) => {
    dispose = end;
    bindSelectValue(
      select,
      () => identity,
      (value) => {
        selected = value;
      },
    );
  });
  select.dispatchEvent(new Event("change"));
  expect(selected).toBe(identity);
  expect(option.hasAttribute("__value")).toBe(false);
  set({});
  await Promise.resolve();
  expect(option.value).toBe("");
  expect(option.textContent).toBe("Label");
  dispose();
  stop();
});

test("select spread reconciles typed options, defaults and later option insertion", async () => {
  const select = document.createElement("select");
  const a = document.createElement("option"),
    b = document.createElement("option");
  a.value = "a";
  b.value = "b";
  select.append(a, b);
  const [read, set] = createSignal<Record<string, unknown>>({
    defaultValue: "a",
    value: "b",
  });
  const stop = mount(select, read);
  await Promise.resolve();
  expect(select.value).toBe("b");
  expect(a.hasAttribute("selected")).toBe(true);
  expect(b.hasAttribute("selected")).toBe(false);
  set({ value: "c", defaultValue: "a" });
  await Promise.resolve();
  expect(select.selectedIndex).toBe(-1);
  const c = document.createElement("option");
  c.value = "c";
  select.append(c);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(select.value).toBe("c");
  set({ multiple: true, value: ["b", "c"], defaultValue: ["a"] });
  await Promise.resolve();
  expect(select.multiple).toBe(true);
  expect(
    Array.from(select.options)
      .filter((option) => option.selected)
      .map((option) => option.value),
  ).toEqual(["b", "c"]);
  set({ multiple: true, value: null, defaultValue: ["a"] });
  await Promise.resolve();
  expect(Array.from(select.options).some((option) => option.selected)).toBe(
    false,
  );
  stop();
});

test("spread checkbox values participate in native typed groups", async () => {
  const { createInputGroup } = await import("../src/binding");
  const first = { id: 1 },
    second = { id: 2 };
  const input = document.createElement("input");
  const [read, set] = createSignal<Record<string, unknown>>({
    type: "checkbox",
    value: first,
  });
  const stop = mount(input, read);
  let model: unknown = [first];
  let dispose!: () => void;
  createRoot((end) => {
    dispose = end;
    createInputGroup(
      "checkbox",
      () => model,
      (value) => {
        model = value;
      },
    ).bind(input);
  });
  expect(input.checked).toBe(true);
  set({ type: "checkbox", value: second });
  await Promise.resolve();
  expect(input.checked).toBe(false);
  input.checked = true;
  input.dispatchEvent(new Event("change"));
  expect((model as unknown[]).includes(second)).toBe(true);
  expect((model as unknown[]).includes("[object Object]")).toBe(false);
  dispose();
  stop();
});

test("form spread sets property-only input booleans and option reset attributes", () => {
  const input = document.createElement("input");
  const stopInput = mount(input, { type: "checkbox", indeterminate: true });
  expect(input.indeterminate).toBe(true);
  expect(input.hasAttribute("indeterminate")).toBe(false);
  const option = document.createElement("option");
  const stopOption = mount(option, { selected: 1 });
  expect(option.hasAttribute("selected")).toBe(true);
  stopOption();
  stopInput();
});

test("bound spreads install once with capture before binding and handlers after", async () => {
  const { installBoundElementSpread } =
    await import("../src/spread-element-dom");
  const { bindValue } = await import("../src/binding");
  const input = document.createElement("input");
  const [model, write] = createSignal<string | number | null>("bound");
  const trace: unknown[] = [];
  const [attrs, update] = createSignal<Record<string, unknown>>({
    value: "spread",
    oninputcapture: () => trace.push(["capture", model()]),
    oninput: () => trace.push(["handler", model()]),
  });
  let installs = 0,
    stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() =>
      installBoundElementSpread(
        input,
        [
          (node) => {
            installs++;
            bindValue(node, model, write);
          },
        ],
        attrs,
      ),
    );
  });
  expect(input.value).toBe("bound");
  input.value = "typed";
  input.dispatchEvent(new Event("input"));
  expect(trace).toEqual([
    ["capture", "bound"],
    ["handler", "typed"],
  ]);
  await Promise.resolve();
  update({
    value: "later",
    oninput: () => trace.push(["replacement", model()]),
  });
  await Promise.resolve();
  expect(installs).toBe(1);
  expect(input.value).toBe("later");
  expect(model()).toBe("typed");
  input.value = "again";
  input.dispatchEvent(new Event("input"));
  expect(trace.at(-1)).toEqual(["replacement", "again"]);
  stop();
});

test("bound select spreads initialize after options and handlers see typed selection", async () => {
  const { installBoundElementSpread } =
    await import("../src/spread-element-dom");
  const { bindSelectValue, setOptionValue } = await import("../src/binding");
  const select = document.createElement("select"),
    a = document.createElement("option"),
    b = document.createElement("option");
  const first = { id: 1 },
    second = { id: 2 };
  setOptionValue(a, first);
  setOptionValue(b, second);
  select.append(a, b);
  const [read, write] = createSignal<unknown>(first);
  const seen: unknown[] = [];
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() =>
      installBoundElementSpread(
        select,
        [(node) => bindSelectValue(node, read, write)],
        { value: second, onchange: () => seen.push(read()) },
      ),
    );
  });
  await Promise.resolve();
  expect(a.selected).toBe(true);
  expect(b.selected).toBe(false);
  b.selected = true;
  select.dispatchEvent(new Event("change"));
  expect(read()).toBe(second);
  expect(seen).toEqual([second]);
  stop();
});

test("unchanged option selected data does not reclaim an externally removed default", async () => {
  const option = document.createElement("option");
  const [read, update] = createSignal<Record<string, unknown>>({
    selected: true,
  });
  const stop = mount(option, read);
  option.removeAttribute("selected");
  update({ selected: true, title: "rest" });
  await Promise.resolve();
  expect(option.hasAttribute("selected")).toBe(false);
  stop();
});

test("select default applies to a matching option inserted after mounting", async () => {
  const select = document.createElement("select"),
    first = document.createElement("option");
  first.value = "first";
  select.append(first);
  const stop = mount(select, { defaultValue: "later" });
  await Promise.resolve();
  const later = document.createElement("option");
  later.value = "later";
  select.append(later);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(later.selected).toBe(true);
  expect(select.value).toBe("later");
  stop();
});
