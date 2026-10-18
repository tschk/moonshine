import { expect, test } from "bun:test";
import { hAttributes, hAttributeEntries, renderToString } from "../src/ssr";

test("explicit attributes preserve form names and do not create selection bindings", () => {
  expect(
    renderToString(() =>
      hAttributes(
        "textarea",
        { value: "attribute", defaultValue: "literal" },
        "body",
      ),
    ),
  ).toBe('<textarea value="attribute" defaultValue="literal">body</textarea>');
  expect(
    renderToString(() =>
      hAttributes(
        "select",
        { value: "second" },
        hAttributes("option", { value: "first" }, "first"),
        hAttributes("option", { value: "second" }, "second"),
      ),
    ),
  ).toBe(
    '<select value="second"><option value="first">first</option><option value="second">second</option></select>',
  );
});

test("explicit attributes keep empty checked and literal ref/children names without executing handlers", () => {
  let reads = 0;
  expect(
    renderToString(() =>
      hAttributes("input", {
        checked: "",
        ref: "literal",
        children: "attribute",
        onClick: () => {
          throw Error("client handler");
        },
        title: () => {
          reads++;
          return "<&";
        },
      }),
    ),
  ).toBe(
    '<input checked="" ref="literal" children="attribute" title="&lt;&amp;">',
  );
  expect(reads).toBe(1);
});

test("explicit attribute values omit nullish values without property coercion", () => {
  expect(
    renderToString(() =>
      hAttributes("input", { value: undefined, title: null, translate: false }),
    ),
  ).toBe('<input translate="false">');
});

test("explicit HTML textarea content retains HTML initial-newline behavior", () => {
  expect(renderToString(() => hAttributes("textarea", null, "\n\nx"))).toBe(
    "<textarea>\n\nx</textarea>",
  );
});

test("ordered explicit entries retain duplicates, omit nullish data and suppress events", () => {
  expect(
    renderToString(() =>
      hAttributeEntries("div", [
        ["title", "first"],
        ["title", "second"],
        ["empty", ""],
        ["missing", undefined],
        ["nullish", null],
        [
          "onClick",
          () => {
            throw Error("client handler");
          },
        ],
      ]),
    ),
  ).toBe('<div title="first" title="second" empty=""></div>');
  expect(() => hAttributeEntries("div", [["bad name", "x"]])).toThrow(
    "Invalid server attribute name",
  );
  expect(() => hAttributeEntries("style", [])).toThrow("Server script/style");
});

test("ordered explicit form attributes do not activate value or selection bindings", () => {
  expect(
    renderToString(() =>
      hAttributeEntries(
        "textarea",
        [
          ["value", "attribute"],
          ["defaultValue", "literal"],
        ],
        "body",
      ),
    ),
  ).toBe('<textarea value="attribute" defaultValue="literal">body</textarea>');
  expect(
    renderToString(() =>
      hAttributeEntries(
        "select",
        [["value", "second"]],
        hAttributeEntries("option", [["value", "first"]], "first"),
        hAttributeEntries("option", [["value", "second"]], "second"),
      ),
    ),
  ).toBe(
    '<select value="second"><option value="first">first</option><option value="second">second</option></select>',
  );
});
