import { expect, test } from "bun:test";
import { createRoot, createSignal } from "@tschk/moonshine-dom/reactive";
import {
  bindTextModel,
  createTextModel,
  type TextModelModifiers,
} from "../src/model";
import { createServerTextModel } from "../src/model-ssr";
import { renderToString } from "@tschk/moonshine-dom/ssr";
import "../../react/test/dom";
function fixture(
  initial: unknown,
  type = "text",
  modifiers: TextModelModifiers = {},
) {
  const element = document.createElement("input");
  element.type = type;
  element.value = "dom-seed";
  document.body.append(element);
  const [read, set] = createSignal(initial);
  let writes = 0,
    stop: () => void;
  createRoot((dispose) => {
    stop = dispose;
    bindTextModel(
      element,
      read,
      (value) => {
        writes++;
        set(value);
      },
      modifiers,
    );
  });
  return {
    element,
    read,
    set,
    writes: () => writes,
    event: (name: string) => element.dispatchEvent(new Event(name)),
    stop: () => {
      stop();
      element.remove();
    },
  };
}
test("model owns initial value and composition commits once, without clobbering IME text", () => {
  const f = fixture(undefined);
  expect(f.element.value).toBe("");
  expect(f.writes()).toBe(0);
  f.event("compositionstart");
  f.element.value = "日本";
  f.event("input");
  expect(f.read()).toBeUndefined();
  f.set("external");
  expect(f.element.value).toBe("日本");
  f.event("compositionend");
  expect(f.read()).toBe("日本");
  expect(f.writes()).toBe(1);
  f.event("compositionend");
  expect(f.writes()).toBe(1);
  f.stop();
});
test("numeric conversion preserves empty/invalid strings and parses prefixes", () => {
  const f = fixture(2, "text", { number: true });
  for (const [text, value] of [
    ["", ""],
    ["bad", "bad"],
    ["12px", 12],
    [" 3.5 ", 3.5],
  ] as const) {
    f.element.value = text;
    f.event("input");
    expect(f.read()).toBe(value);
  }
  f.stop();
  const n = fixture(2, "number");
  n.element.value = "";
  n.event("input");
  expect(n.read()).toBe("");
  n.stop();
});
test("trim preserves focused whitespace until change; lazy ignores input", () => {
  const f = fixture("seed", "text", { trim: true });
  f.element.focus();
  f.element.value = " next ";
  f.event("input");
  expect(f.read()).toBe("next");
  expect(f.element.value).toBe(" next ");
  f.event("change");
  expect(f.element.value).toBe("next");
  f.stop();
  const l = fixture("seed", "text", { lazy: true, trim: true });
  l.element.value = " next ";
  l.event("input");
  expect(l.read()).toBe("seed");
  l.event("change");
  expect(l.read()).toBe("next");
  expect(l.element.value).toBe("next");
  l.stop();
});
test("instances isolate and disposal removes every model listener and render effect", () => {
  const a = fixture("a"),
    b = fixture("b");
  a.stop();
  a.element.value = "detached";
  a.event("input");
  a.event("compositionstart");
  a.event("compositionend");
  a.event("change");
  expect(a.writes()).toBe(0);
  a.set("ignored");
  expect(a.element.value).toBe("detached");
  expect(b.read()).toBe("b");
  b.element.value = "live";
  b.event("input");
  expect(b.read()).toBe("live");
  b.stop();
});
test("requires a live owner and rejects non-text controls", () => {
  expect(() =>
    bindTextModel(
      document.createElement("input"),
      () => "",
      () => {},
    ),
  ).toThrow("live native owner");
  createRoot((stop) => {
    const el = document.createElement("input");
    el.type = "checkbox";
    expect(() =>
      bindTextModel(
        el,
        () => "",
        () => {},
      ),
    ).toThrow("text or numeric");
    stop();
  });
});

test("element factory keeps attributes live and publishes the model before user input handlers", () => {
  const [value, setValue] = createSignal("seed");
  const [label, setLabel] = createSignal("first");
  let stop!: () => void;
  let observed: unknown;
  let element!: HTMLInputElement | HTMLTextAreaElement;
  createRoot((dispose) => {
    stop = dispose;
    element = createTextModel(
      "input",
      {
        type: "text",
        get title() {
          return label();
        },
        onInput: () => {
          observed = value();
        },
      },
      value,
      setValue,
    );
  });
  expect(element.title).toBe("first");
  setLabel("second");
  expect(element.title).toBe("second");
  element.value = "next";
  element.dispatchEvent(new Event("input"));
  expect(observed).toBe("next");
  stop();
});

test("server factory omits nullish input values and escapes textarea models without loading the DOM factory", () => {
  for (const value of [undefined, null])
    expect(
      renderToString(() =>
        createServerTextModel("input", { type: "text" }, () => value),
      ),
    ).toBe('<input type="text">');
  expect(
    renderToString(() => createServerTextModel("input", {}, () => '<&"')),
  ).toBe('<input value="&lt;&amp;&quot;">');
  expect(
    renderToString(() => createServerTextModel("textarea", {}, () => "<&")),
  ).toBe("<textarea>&lt;&amp;</textarea>");
});
