import { afterEach, expect, test } from "bun:test";
import { h, hNS, render } from "../src/dom";
import { createSignal } from "../src/reactive";
import "../../react/test/dom";

const HTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";
let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

test("explicit lexical namespaces survive an opposite hosting namespace", () => {
  const host = document.createElementNS(SVG, "svg");
  document.body.append(host);
  stop = render(
    () => [
      hNS(HTML, "a"),
      hNS(HTML, "title"),
      hNS(SVG, "a"),
      hNS(SVG, "title"),
    ],
    host,
  );
  expect(Array.from(host.children).map((node) => node.namespaceURI)).toEqual([
    HTML,
    HTML,
    SVG,
    SVG,
  ]);
  const title: SVGTitleElement = hNS(SVG, "title");
  const anchor: HTMLAnchorElement = hNS(HTML, "a");
  expect(title.namespaceURI).toBe(SVG);
  expect(anchor.namespaceURI).toBe(HTML);
});

test("explicit creation namespace preserves authored xmlns as an attribute", () => {
  const node = hNS(SVG, "title", { xmlns: HTML, "data-label": "<&>" }, "<&>");
  expect(node.namespaceURI).toBe(SVG);
  expect(node.getAttribute("xmlns")).toBe(HTML);
  expect(node.getAttribute("data-label")).toBe("<&>");
  expect(node.textContent).toBe("<&>");
  expect(hNS(SVG, "title").hasAttribute("xmlns")).toBe(false);
});

test("lexical factories retain node identity and stop reactive writes", () => {
  const [read, write] = createSignal("one");
  stop = render(
    () =>
      hNS(SVG, "svg", null, () =>
        hNS(SVG, "title", { "data-value": read }, read),
      ),
    document.body,
  );
  const node = document.querySelector("title")!;
  write("two");
  expect(document.querySelector("title")).toBe(node);
  expect(node.textContent).toBe("two");
  expect(node.getAttribute("data-value")).toBe("two");
  stop();
  const disposedText = node.textContent;
  const disposedValue = node.getAttribute("data-value");
  write("three");
  expect(node.textContent).toBe(disposedText);
  expect(node.getAttribute("data-value")).toBe(disposedValue);
  expect(node.isConnected).toBe(false);
});

test("foreignObject and nested svg can select their own lexical factories", () => {
  stop = render(
    () =>
      hNS(SVG, "svg", null, () =>
        hNS(SVG, "foreignObject", null, () => [
          hNS(HTML, "a"),
          hNS(SVG, "svg", null, () => hNS(SVG, "a")),
        ]),
      ),
    document.body,
  );
  expect(
    Array.from(document.querySelectorAll("a")).map((node) => node.namespaceURI),
  ).toEqual([HTML, SVG]);
});

test("ordinary h retains its existing inferred and authored namespace behavior", () => {
  expect(h("title").namespaceURI).toBe(HTML);
  expect(h("title", { xmlns: SVG }).namespaceURI).toBe(SVG);
  stop = render(() => h("svg", null, () => h("a")), document.body);
  expect(document.querySelector("a")!.namespaceURI).toBe(SVG);
});

test("arbitrary namespace URIs are delegated to createElementNS", () => {
  const MATH = "http://www.w3.org/1998/Math/MathML";
  const math = hNS(MATH, "math", { xmlns: HTML }, hNS(MATH, "mi", null, "x"));
  expect(math.namespaceURI).toBe(MATH);
  expect(math.getAttribute("xmlns")).toBe(HTML);
  expect(math.firstElementChild!.namespaceURI).toBe(MATH);
  const custom = hNS("urn:custom", "x-y");
  expect(custom.namespaceURI).toBe("urn:custom");
  expect(hNS("", "x").namespaceURI || null).toBeNull();
});

test("non-string explicit namespaces reject at the public boundary", () => {
  for (const value of [null, undefined, 1, {}])
    expect(() => Reflect.apply(hNS, null, [value, "title"])).toThrow(
      "Unsupported element namespace",
    );
});
