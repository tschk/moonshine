import { expect, test } from "bun:test";
import { hAttributes, renderToString } from "../src/ssr";

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
