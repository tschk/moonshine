import { expect, test } from "bun:test";
import {
  h,
  hSource,
  renderToString,
  selectBinding,
  optionBinding,
} from "../src/ssr";

test("source codec keeps literals and applies dynamic HTML presence semantics in SVG", () => {
  const output = renderToString(() =>
    hSource(
      "svg",
      null,
      () =>
        hSource("g", {
          disabled: () => "false",
          hidden: () => "until-found",
          translate: () => false,
          "aria-hidden": () => false,
          download: () => true,
        }),
      () =>
        hSource("g", { disabled: "false", hidden: "false", translate: "true" }),
      () =>
        hSource("g", {
          disabled: () => NaN,
          hidden: () => 0,
          title: () => Symbol("ok"),
        }),
    ),
  );
  expect(output).toBe(
    '<svg><g disabled="" hidden="until-found" translate="no" aria-hidden="false" download="true"></g><g disabled="false" hidden="false" translate="true"></g><g title="Symbol(ok)"></g></svg>',
  );
  expect(
    renderToString(() =>
      h("svg", null, h("g", { disabled: true, hidden: false })),
    ),
  ).toBe('<svg><g disabled="true" hidden="false"></g></svg>');
});

test("source reads and string coercion precede lazy component setup and failures prevent setup", () => {
  const trace: string[] = [];
  const value = {
    [Symbol.toPrimitive](hint: string) {
      trace.push(hint);
      return "<&";
    },
  };
  const Child = () => {
    trace.push("child");
    return hSource("i", null, "child");
  };
  expect(
    renderToString(() =>
      hSource(
        "div",
        {
          title: () => {
            trace.push("read");
            return value;
          },
        },
        () => h(Child, {}),
      ),
    ),
  ).toBe('<div title="&lt;&amp;"><i>child</i></div>');
  expect(trace).toEqual(["read", "string", "child"]);
  trace.length = 0;
  expect(() =>
    renderToString(() =>
      hSource(
        "div",
        {
          title: () => ({
            toString() {
              throw new Error("coerce");
            },
          }),
        },
        () => h(Child, {}),
      ),
    ),
  ).toThrow("coerce");
  expect(trace).toEqual([]);
});

test("source nullish value omission, functions and boolean table deltas", () => {
  let calls = 0;
  const fn = () => {
    calls++;
    return "bad";
  };
  const output = renderToString(() =>
    hSource("input", {
      value: () => undefined,
      title: () => fn,
      indeterminate: () => true,
      itemscope: () => false,
    }),
  );
  expect(output).toContain('indeterminate="" itemscope="false"');
  expect(output).not.toContain(" value=");
  expect(output).toContain('title="');
  expect(calls).toBe(0);
  expect(renderToString(() => h("input", { value: () => undefined }))).toBe(
    '<input value="">',
  );
});

test("source typed select retains raw identity, default precedence and style extension", () => {
  const raw = {};
  const output = renderToString(() =>
    hSource(
      "select",
      { [selectBinding]: { value: raw } },
      () => hSource("option", { [optionBinding]: { value: raw } }, "yes"),
      () => hSource("option", { [optionBinding]: { value: {} } }, "no"),
    ),
  );
  expect(output).toBe(
    '<select><option value="[object Object]" selected="">yes</option><option value="[object Object]">no</option></select>',
  );
  expect(
    renderToString(() =>
      hSource("input", {
        defaultValue: "old",
        value: () => null,
        defaultChecked: true,
        style: { color: "red" },
      }),
    ),
  ).toBe('<input checked="" style="color:red;">');
});

test("source intrinsic security and unchanged component factory path", () => {
  expect(() => hSource("script", null)).toThrow();
  expect(() => hSource("div", { innerHTML: "raw" })).toThrow();
  expect(() => hSource("div", { "bad name": 1 })).toThrow();
  let calls = 0;
  expect(
    renderToString(() =>
      h(
        (props: { name: string }) => {
          calls++;
          return h("b", null, props.name);
        },
        { name: "safe" },
      ),
    ),
  ).toBe("<b>safe</b>");
  expect(calls).toBe(1);
});

test("source ordinary option coerces once before its child, preserving comparison text", () => {
  const trace: string[] = [];
  const value = {
    toString() {
      trace.push("coerce");
      return "x";
    },
  };
  expect(
    renderToString(() =>
      hSource("select", { value: "x" }, () =>
        hSource("option", { value: () => value }, () => {
          trace.push("child");
          return "option";
        }),
      ),
    ),
  ).toBe('<select><option value="x" selected="">option</option></select>');
  expect(trace).toEqual(["coerce", "child"]);
});

test("source eager getters fail before children and defer keeps owned context and cleanup", async () => {
  const { defer, scopeSSRChild } = await import("../src/ssr");
  const { getContext, setContext } = await import("../src/component");
  const { onCleanup } = await import("../src/reactive");
  let children = 0;
  expect(() =>
    hSource(
      "div",
      {
        get title() {
          throw new Error("getter");
        },
      },
      () => {
        children++;
        return "child";
      },
    ),
  ).toThrow("getter");
  expect(children).toBe(0);
  const cleaned: string[] = [];
  const Leaf = () => {
    const name = getContext<string>("name")!;
    onCleanup(() => cleaned.push(name));
    return hSource("b", null, name);
  };
  const Provider = ({ name }: { name: string }) => {
    setContext("name", name);
    return scopeSSRChild(
      defer(() => hSource("section", { title: () => name }, () => h(Leaf, {}))),
    );
  };
  for (let request = 0; request < 2; request++)
    expect(
      renderToString(() =>
        hSource(
          "main",
          null,
          () => h(Provider, { name: "a" }),
          () => h(Provider, { name: "b" }),
        ),
      ),
    ).toBe(
      '<main><section title="a"><b>a</b></section><section title="b"><b>b</b></section></main>',
    );
  expect(cleaned).toEqual(["a", "b", "a", "b"]);
});

test("source select presence avoids object coercion while typed selection overrides authored selected", () => {
  let coercions = 0;
  const flag = {
    toString() {
      coercions++;
      throw new Error("presence must not coerce");
    },
  };
  expect(
    renderToString(() =>
      hSource("select", { multiple: () => flag }, () =>
        hSource("option", { selected: () => flag }, "plain"),
      ),
    ),
  ).toBe('<select multiple=""><option selected="">plain</option></select>');
  expect(
    renderToString(() =>
      hSource(
        "select",
        { [selectBinding]: { value: ["b"] }, multiple: true },
        () => [
          hSource(
            "option",
            { [optionBinding]: { value: "a" }, selected: () => flag },
            "a",
          ),
          hSource(
            "option",
            { [optionBinding]: { value: "b" }, selected: () => flag },
            "b",
          ),
        ],
      ),
    ),
  ).toBe(
    '<select multiple=""><option value="a">a</option><option value="b" selected="">b</option></select>',
  );
  expect(coercions).toBe(0);
});

test("compiled select policy retains authored selected flags without changing native defaults", () => {
  const render = (preserveSelected: boolean) =>
    renderToString(() =>
      hSource(
        "select",
        { [selectBinding]: { value: "b", preserveSelected } },
        () => [
          hSource(
            "option",
            { [optionBinding]: { value: "a" }, selected: true },
            "a",
          ),
          hSource("option", { [optionBinding]: { value: "b" } }, "b"),
        ],
      ),
    );
  expect(render(true)).toBe(
    '<select><option value="a" selected="">a</option><option value="b" selected="">b</option></select>',
  );
  expect(render(false)).toBe(
    '<select><option value="a">a</option><option value="b" selected="">b</option></select>',
  );
  let reads = 0;
  const box = {
    value: "b",
    get preserveSelected() {
      reads++;
      return true;
    },
  };
  expect(() =>
    renderToString(() => hSource("select", { [selectBinding]: box })),
  ).toThrow("own boolean data value");
  expect(reads).toBe(0);
});

test("source typed options retain the value attribute slot without reading its override", () => {
  const calls: string[] = [];
  const raw = {
    toString() {
      calls.push("value");
      return "raw";
    },
  };
  const props = {
    "data-before": () => {
      calls.push("before");
      return "a";
    },
    get value(): never {
      throw new Error("typed value override must stay unread");
    },
    "data-after": () => {
      calls.push("after");
      return "b";
    },
    [optionBinding]: { value: raw },
  };
  expect(
    renderToString(() =>
      hSource("option", props, () => {
        calls.push("child");
        return "x";
      }),
    ),
  ).toBe('<option data-before="a" value="raw" data-after="b">x</option>');
  expect(calls).toEqual(["before", "value", "after", "child"]);
});
