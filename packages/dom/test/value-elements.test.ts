import { afterEach, expect, test } from "bun:test";
import { h, render } from "../src/dom";
import { h as serverH, renderToString } from "../src/ssr";
import { createSignal } from "../src/reactive";
import "../../react/test/dom";
const disposers: Array<() => void> = [];
afterEach(() => {
  for (const stop of disposers.splice(0)) stop();
  document.body.replaceChildren();
});

test("numeric reflected elements skip initial nullish values and normalize later nullish writes", () => {
  for (const tag of ["progress", "meter", "li"]) {
    const [read, set] = createSignal<unknown>(undefined);
    const container = document.createElement("main");
    document.body.append(container);
    disposers.push(render(() => h(tag, { value: read }, "body"), container));
    const element = container.firstElementChild!;
    expect(element.hasAttribute("value")).toBe(false);
    set(null);
    expect(element.hasAttribute("value")).toBe(false);
    set(2);
    expect(element.getAttribute("value")).toBe("2");
    set(null);
    expect(element.getAttribute("value")).toBe("0");
    set(0);
    expect(element.getAttribute("value")).toBe("0");
    set(undefined);
    expect(element.getAttribute("value")).toBe("0");
    for (const value of [null, undefined])
      expect(renderToString(() => serverH(tag, { value }, "body"))).toBe(
        `<${tag}>body</${tag}>`,
      );
    expect(renderToString(() => serverH(tag, { value: 0 }, "body"))).toBe(
      `<${tag} value="0">body</${tag}>`,
    );
  }
});

test("explicit empty option values survive child insertion and resynchronize their select", () => {
  for (const value of ["", null, undefined]) {
    const option = h("option", { value }, "label") as HTMLOptionElement;
    expect(option.getAttribute("value")).toBe("");
    expect(option.value).toBe("");
    expect(renderToString(() => serverH("option", { value }, "label"))).toBe(
      '<option value="">label</option>',
    );
  }
  const [read, set] = createSignal<unknown>(undefined);
  const container = document.createElement("main");
  document.body.append(container);
  disposers.push(
    render(
      () => h("select", { value: "" }, h("option", { value: read }, "label")),
      container,
    ),
  );
  const select = container.firstElementChild as HTMLSelectElement;
  expect(select.selectedIndex).toBe(0);
  set("other");
  expect(select.selectedIndex).toBe(-1);
  set("");
  expect(select.selectedIndex).toBe(0);
});

test("output live values replace children after insertion and preserve initial nullish content", () => {
  for (const value of [0, 2, ""]) {
    const output = h("output", { value }, "body") as HTMLOutputElement;
    expect(output.textContent).toBe(String(value));
    expect(output.value).toBe(String(value));
  }
  for (const value of [null, undefined])
    expect((h("output", { value }, "body") as HTMLOutputElement).value).toBe(
      "body",
    );
  const [read, set] = createSignal<unknown>(undefined);
  const container = document.createElement("main");
  document.body.append(container);
  disposers.push(render(() => h("output", { value: read }, "body"), container));
  const output = container.firstElementChild as HTMLOutputElement;
  expect(output.value).toBe("body");
  set(null);
  expect(output.value).toBe("body");
  set(2);
  expect(output.value).toBe("2");
  set(null);
  expect(output.value).toBe("");
  // Like Svelte SSR, output value remains an attribute while fallback children serialize.
  expect(renderToString(() => serverH("output", { value: 2 }, "body"))).toBe(
    '<output value="2">body</output>',
  );
});

test("input and textarea nullish value contracts remain empty", () => {
  for (const tag of ["input", "textarea"]) {
    expect((h(tag, { value: undefined }) as HTMLInputElement).value).toBe("");
    expect(renderToString(() => serverH(tag, { value: undefined }))).toBe(
      tag === "input" ? '<input value="">' : "<textarea></textarea>",
    );
  }
});

test("numeric initial zero retains native IDL defaults except determinate progress", () => {
  for (const tag of ["progress", "meter", "li"]) {
    const zero = h(tag, { value: 0 }) as HTMLProgressElement;
    expect(zero.value).toBe(0);
    expect(zero.hasAttribute("value")).toBe(tag === "progress");
    const empty = h(tag, { value: "" });
    expect(empty.getAttribute("value")).toBe("0");
  }
});

test("HTML value handling does not replace attributes or children on SVG namesakes", () => {
  const svg = "http://www.w3.org/2000/svg";
  for (const tag of ["progress", "meter", "li", "output"]) {
    const [read, set] = createSignal<number | null>(2);
    const container = document.createElement("main");
    document.body.append(container);
    disposers.push(
      render(() => h(tag, { xmlns: svg, value: read }, "body"), container),
    );
    const element = container.firstElementChild!;
    expect(element.namespaceURI).toBe(svg);
    expect(element.getAttribute("value")).toBe("2");
    expect(element.textContent).toBe("body");
    set(null);
    expect(element.hasAttribute("value")).toBe(false);
    expect(element.textContent).toBe("body");
  }
});
