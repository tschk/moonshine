import { expect, test } from "bun:test";
import { h, renderToString, classList } from "../src/ssr";

test("Astro source children preserve truthy booleans and omit falsey values except zero", () => {
  expect(
    renderToString(() => h("p", null, true, false, 0, NaN, 0n, ["<&", true])),
  ).toBe("<p>true0&lt;&amp;true</p>");
  expect(() =>
    renderToString(() => h("p", null, () => Promise.resolve("later") as never)),
  ).toThrow("Async Astro children");
});

test("Astro dynamic booleans distinguish HTML, custom elements and literal attributes", () => {
  expect(
    renderToString(() =>
      h("input", {
        disabled: () => "",
        checked: () => "yes",
        readonly: "false",
        value: "x",
      }),
    ),
  ).toBe('<input checked="" readonly="false" value="x">');
  expect(
    renderToString(() =>
      h("my-field", { disabled: () => false, popover: () => true }),
    ),
  ).toBe('<my-field disabled="false" popover=""></my-field>');
  expect(
    renderToString(() =>
      h("div", {
        alpha: () => false,
        hidden: () => false,
        "data-ready": () => true,
      }),
    ),
  ).toBe('<div alpha="false" data-ready="true"></div>');
});

test("Astro class lists flatten arrays and conditional objects without a dependency", () => {
  expect(
    classList([
      "base",
      [false, "nested"],
      { active: true, hidden: false },
      0,
      2,
    ]),
  ).toBe("base nested active 2");
});

test("Astro styles use CSS values without React units and do not reinterpret HTML property names", () => {
  expect(
    renderToString(() =>
      h("div", {
        style: () => ({
          width: 12,
          backgroundColor: "red",
          "--accent": "blue",
        }),
        htmlFor: "target",
        children: "attribute",
        innerHTML: "<b>",
      }),
    ),
  ).toBe(
    '<div style="width:12;background-color:red;--accent:blue" htmlFor="target" children="attribute" innerHTML="&lt;b&gt;"></div>',
  );
});

test("Astro component props keep type and reference identity", () => {
  const payload = { value: "<&" };
  const Component = (props: { payload: typeof payload }) => {
    expect(props.payload).toBe(payload);
    return h("b", null, props.payload.value);
  };
  expect(renderToString(() => h(Component, { payload }))).toBe(
    "<b>&lt;&amp;</b>",
  );
});

test("Astro component props capture each accessor once before child setup", () => {
  let reads = 0;
  const Component = (props: { value: string }) => {
    props.value += "!";
    return h("p", null, props.value, props.value);
  };
  const html = renderToString(() =>
    h(Component, {
      get value() {
        reads++;
        return "captured";
      },
    }),
  );
  expect(reads).toBe(1);
  expect(html).toBe("<p>captured!captured!</p>");
});

test("rejected async children fail synchronously without leaking an unhandled rejection", async () => {
  expect(() =>
    renderToString(() =>
      h("p", null, () => Promise.reject(new Error("later")) as never),
    ),
  ).toThrow("Async Astro children");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("Astro pre and textarea retain literal HTML newline serialization", () => {
  for (const tag of ["pre", "textarea"]) {
    for (const body of ["\nx", "\n\nx", "  a\n  b\n"]) {
      expect(renderToString(() => h(tag, null, body))).toBe(
        `<${tag}>${body}</${tag}>`,
      );
    }
  }
});
