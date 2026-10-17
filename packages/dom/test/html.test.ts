import { afterEach, expect, test, spyOn } from "bun:test";
import { rawHTML, htmlContent } from "../src/html";
import { h, render } from "../src/dom";
import {
  h as serverH,
  rawHTML as serverHTML,
  renderToString,
} from "../src/ssr";
import {
  createRoot,
  createSignal,
  getOwner,
  runWithOwner,
} from "../src/reactive";
import "../../react/test/dom";
const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  document.body.replaceChildren();
});

test("raw markup is opt-in while ordinary DOM and SSR children remain escaped", () => {
  const container = document.createElement("main");
  document.body.append(container);
  stops.push(
    render(
      () =>
        h(
          "div",
          null,
          "<b>escaped</b>",
          rawHTML(() => "<b>raw</b>"),
        ),
      container,
    ),
  );
  expect(container.querySelector("div")!.textContent).toBe("<b>escaped</b>raw");
  expect(container.querySelectorAll("b")).toHaveLength(1);
  expect(
    renderToString(() =>
      serverH("div", null, "<b>escaped</b>", serverHTML("<b>raw</b>")),
    ),
  ).toBe("<div>&lt;b&gt;escaped&lt;/b&gt;<b>raw</b></div>");
});

test("raw accessor caches raw identity, normalizes nullish, and keeps function values literal", () => {
  let value: unknown = null;
  const read = rawHTML(() => value);
  expect(read()).toEqual([]);
  for (const entry of [false, true, 0, 1, 1n]) {
    value = entry;
    expect(
      read()
        .map((node) => node.textContent)
        .join(""),
    ).toBe(String(entry));
  }
  value = "<b>same</b>";
  const first = read();
  expect(read()).toBe(first);
  value = { toString: () => "<b>same</b>" };
  expect(read()[0]).not.toBe(first[0]);
  value = 1;
  const number = read()[0];
  value = "1";
  expect(read()[0]).not.toBe(number);
  let invoked = 0;
  value = () => {
    invoked++;
  };
  expect(
    read()
      .map((node) => node.textContent)
      .join(""),
  ).toBe(String(value));
  expect(invoked).toBe(0);
  expect(renderToString(() => serverHTML(value))).toBe(String(value));
  expect(invoked).toBe(0);
  value = undefined;
  expect(read()).toEqual([]);
  for (const entry of [false, true, 0, 1n, null, undefined])
    expect(renderToString(() => serverHTML(entry))).toBe(
      entry == null ? "" : String(entry),
    );
  expect(() => rawHTML(null as any)).toThrow("getter");
  expect(() => rawHTML(() => "", "bad" as any)).toThrow("namespace");
});

test("ordinary insertion owns raw sibling nodes across replacement and disposal", () => {
  const [value, set] = createSignal("<b>first</b><em>second</em>");
  const container = document.createElement("main");
  document.body.append(container);
  const stop = render(
    () =>
      h(
        "section",
        null,
        h("i", null, "before"),
        rawHTML(value),
        h("i", null, "after"),
      ),
    container,
  );
  stops.push(stop);
  const before = container.querySelector("i")!,
    first = container.querySelector("b")!,
    last = container.querySelectorAll("i")[1]!;
  set("<b>first</b><em>second</em>");
  expect(container.querySelector("b")).toBe(first);
  set("<strong>replacement</strong>");
  expect(first.isConnected).toBe(false);
  expect(container.querySelector("i")).toBe(before);
  expect(container.querySelectorAll("i")[1]).toBe(last);
  const replacement = container.querySelector("strong")!;
  stop();
  expect(replacement.isConnected).toBe(false);
  set("<u>late</u>");
  expect(container.childNodes).toHaveLength(0);
});

test("namespace wrappers preserve SVG and MathML without extra elements", () => {
  expect(
    (rawHTML(() => '<circle cx="2"/>', "svg")()[0] as Element).namespaceURI,
  ).toBe("http://www.w3.org/2000/svg");
  // Happy DOM does not propagate MathML parsing namespaces; Chromium checks children.
  const create = spyOn(document, "createElementNS");
  try {
    expect(
      (rawHTML(() => "<mi>x</mi>", "mathml")()[0] as Element).localName,
    ).toBe("mi");
    expect(create).toHaveBeenCalledWith(
      "http://www.w3.org/1998/Math/MathML",
      "math",
    );
  } finally {
    create.mockRestore();
  }
});

test("controlled markup owns a sole-child element and follows raw identity", () => {
  const [value, set] = createSignal<unknown>("<b>first</b>");
  const container = document.createElement("main");
  document.body.append(container);
  const stop = render(
    () => h("section", { ref: (element) => htmlContent(element, value) }),
    container,
  );
  stops.push(stop);
  const section = container.firstElementChild!,
    first = section.firstChild;
  set("<b>first</b>");
  expect(section.firstChild).toBe(first);
  set("<i>second</i>");
  expect(section.innerHTML).toBe("<i>second</i>");
  set(null);
  expect(section.childNodes).toHaveLength(0);
  set("<u>final</u>");
  const retained = section.firstChild!;
  stop();
  expect(section.childNodes).toHaveLength(0);
  expect(retained.isConnected).toBe(false);
  expect(() => htmlContent(section, () => "")).toThrow("live native owner");
  createRoot((dispose) => {
    try {
      expect(() => htmlContent({} as Element, () => "")).toThrow(
        "element and getter",
      );
      expect(() => htmlContent(section, null as any)).toThrow(
        "element and getter",
      );
    } finally {
      dispose();
    }
  });
  let owner: ReturnType<typeof getOwner>;
  createRoot((dispose) => {
    owner = getOwner();
    dispose();
  });
  expect(() =>
    runWithOwner(owner, () => htmlContent(section, () => "")),
  ).toThrow("live native owner");
});
