import { expect, test } from "bun:test";
import {
  renderToString,
  sourceAttribute,
  sourceElement,
  sourceSpread,
} from "../src/ssr";

test("intrinsic spread captures own string getters once and retains repeated attributes", () => {
  let reads = 0;
  const attrs = Object.create({ inherited: "no" });
  Object.defineProperty(attrs, "title", {
    enumerable: true,
    get() {
      reads++;
      return "spread";
    },
  });
  Object.defineProperty(attrs, Symbol("ignored"), {
    enumerable: true,
    get() {
      throw Error("symbol read");
    },
  });
  const captured = sourceSpread("div", attrs);
  const html = sourceElement("div", [
    sourceAttribute("div", "title", "first"),
    ...captured,
    sourceAttribute("div", "title", "last", true),
  ]);
  expect(reads).toBe(1);
  for (let i = 0; i < 2; i++)
    expect(renderToString(() => html)).toBe(
      '<div title="first" title="spread" title="last"></div>',
    );
  expect(reads).toBe(1);
});

test("spread functions stringify without invocation, while events remain suppressed", () => {
  let calls = 0;
  function data() {
    calls++;
    return "wrong";
  }
  const html = renderToString(() =>
    sourceElement("div", sourceSpread("div", { title: data, onclick: data })),
  );
  expect(calls).toBe(0);
  expect(html).toContain("function data");
  expect(html).not.toContain("onclick=");
});

test("literal and dynamic booleans and duplicate classes retain provenance", () => {
  expect(
    renderToString(() =>
      sourceElement("input", [
        sourceAttribute("input", "disabled", "false"),
        ...sourceSpread("input", {
          checked: false,
          hidden: "until-found",
          required: "false",
        }),
      ]),
    ),
  ).toBe('<input disabled="false" hidden="until-found" required="">');
  const attrs = {
    class: "spread",
    "class:list": ["list", { active: true }],
    style: { color: "red" },
  };
  const captured = sourceSpread("div", attrs);
  attrs.class = "changed";
  expect(
    renderToString(() =>
      sourceElement("div", [
        sourceAttribute("div", "class", "static"),
        ...captured,
      ]),
    ),
  ).toBe(
    '<div class="static" class="spread" class="list active" style="color:red"></div>',
  );
  expect(
    renderToString(() =>
      sourceElement(
        "custom-input",
        sourceSpread("custom-input", { disabled: false, popover: false }),
      ),
    ),
  ).toBe('<custom-input disabled="false"></custom-input>');
});

test("coercion precedes the next getter and later authored expressions", () => {
  const trace: string[] = [];
  const attrs = {
    get title() {
      trace.push("get-title");
      return {
        toString() {
          trace.push("coerce-title");
          return "one";
        },
      };
    },
    get id() {
      trace.push("get-id");
      return "two";
    },
  };
  const entries = [
    ...sourceSpread("div", attrs),
    sourceAttribute("div", "data-end", (trace.push("end"), "three"), true),
  ];
  expect(trace).toEqual(["get-title", "coerce-title", "get-id", "end"]);
  expect(renderToString(() => sourceElement("div", entries))).toBe(
    '<div title="one" id="two" data-end="three"></div>',
  );
});

test("validation fails before later spread getters and values stay escaped", () => {
  let later = false;
  expect(() =>
    sourceSpread("div", {
      "bad name": "x",
      get title() {
        later = true;
        return "x";
      },
    }),
  ).toThrow("Invalid server attribute name");
  expect(later).toBe(false);
  expect(() => sourceElement("script", [])).toThrow("Server script/style");
  expect(() => sourceSpread("div", { "set:html": "<b>raw</b>" })).toThrow(
    "Unsupported Astro spread directive",
  );
  expect(
    renderToString(() =>
      sourceElement(
        "div",
        sourceSpread("div", { title: '"<&', innerHTML: "<b>text</b>" }),
      ),
    ),
  ).toContain("&lt;b&gt;text&lt;/b&gt;");
  expect(sourceSpread("div", null)).toEqual([]);
  expect(sourceSpread("div", undefined)).toEqual([]);
});

test("spread data covers aliases, style tuples, false values and primitive boundaries", () => {
  expect(
    renderToString(() =>
      sourceElement(
        "div",
        sourceSpread("div", {
          className: "alias",
          "class:list": ["list"],
          style: [{ color: "red" }, "display:block"],
          title: false,
          "data-x": false,
          "aria-hidden": false,
          draggable: false,
        }),
      ),
    ),
  ).toBe(
    '<div class="alias" class="list" style="color:red;display:block" title="false" data-x="false" aria-hidden="false" draggable="false"></div>',
  );
  expect(sourceSpread("div", 1)).toEqual([]);
  expect(sourceSpread("div", false)).toEqual([]);
  expect(() => sourceSpread("div", "text")).toThrow(
    "Invalid server attribute name",
  );
  expect(() => sourceSpread("div", ["item"])).toThrow(
    "Invalid server attribute name",
  );
});
