import { expect, test } from "bun:test";
import {
  h,
  escapeHtml,
  renderToString,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  type SSRChild,
  selectBinding,
  optionBinding,
} from "../src/ssr";

test("component child descriptors preserve lazy reads with absent or accessor props", () => {
  for (const supplied of [
    null,
    {
      get title() {
        return "title";
      },
    },
  ]) {
    let reads = 0;
    const trace: string[] = [];
    const output = renderToString(() =>
      h(
        (props: { title?: string; children?: SSRChild }) => {
          expect(Object.getOwnPropertyDescriptor(props, "children")).toEqual({
            value: props.children,
            enumerable: true,
            configurable: true,
            writable: false,
          });
          expect(Object.getOwnPropertyDescriptor(props, "title")?.get).toBe(
            supplied
              ? Object.getOwnPropertyDescriptor(supplied, "title")!.get
              : undefined,
          );
          expect(reads).toBe(0);
          onCleanup(() => trace.push("cleanup"));
          return h("p", null, props.children);
        },
        supplied,
        () => {
          reads++;
          return "child";
        },
      ),
    );
    expect(output).toBe("<p>child</p>");
    expect(reads).toBe(1);
    expect(trace).toEqual(["cleanup"]);
  }
});

test("ordinary accessor attributes and children snapshot at the same construction phase", () => {
  expect(
    renderToString(() => {
      const [value, setValue] = createSignal(1);
      const node = h("p", { title: value }, value);
      setValue(2);
      return node;
    }),
  ).toBe('<p title="1">1</p>');
});

test("escaping preserves exact entities, Unicode and single coercion", () => {
  for (const value of [
    undefined,
    null,
    true,
    17n,
    Symbol("text"),
    "plain 😀\ud800\udfff\0\n\u2028",
    '<&>"',
    "'<&>\"",
  ]) {
    const expected = String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
    expect(escapeHtml(value)).toBe(expected);
  }
  let reads = 0;
  expect(
    escapeHtml({
      toString() {
        reads++;
        return "<&";
      },
    }),
  ).toBe("&lt;&amp;");
  expect(reads).toBe(1);
});

test("server factory escapes text/attributes and accepts nested accessor arrays", () => {
  expect(
    renderToString(() =>
      h(
        "main",
        {
          title: `"'<&>`,
          className: "page",
          hidden: true,
          "aria-hidden": false,
          disabled: false,
        },
        ["<&>", () => [1, 2n, null, false, h("br")]],
      ),
    ),
  ).toBe(
    '<main title="&quot;&#39;&lt;&amp;&gt;" class="page" hidden="" aria-hidden="false">&lt;&amp;&gt;12<br></main>',
  );
  expect(renderToString(() => "<b>untrusted</b>")).toBe(
    "&lt;b&gt;untrusted&lt;/b&gt;",
  );
});

test("HTML boolean attributes differ from enumerated, data and ARIA attributes", () => {
  expect(
    renderToString(() =>
      h("button", {
        disabled: false,
        required: true,
        readOnly: true,
        hidden: "until-found",
        contenteditable: false,
        spellcheck: false,
        draggable: false,
        "data-active": true,
        "aria-pressed": false,
        title: null,
      }),
    ),
  ).toBe(
    '<button required="" readOnly="" hidden="until-found" contenteditable="false" spellcheck="false" draggable="false" data-active="true" aria-pressed="false"></button>',
  );
});

test("SVG attributes stringify booleans through nested context and foreignObject returns to HTML", () => {
  expect(
    renderToString(() =>
      h(
        "svg",
        { hidden: false, value: null },
        h("a", { disabled: false, "aria-hidden": true }),
        h(
          "foreignObject",
          { hidden: false },
          h("button", { disabled: false, hidden: true, draggable: false }),
        ),
      ),
    ),
  ).toBe(
    '<svg hidden="false"><a disabled="false" aria-hidden="true"></a><foreignObject hidden="false"><button hidden="" draggable="false"></button></foreignObject></svg>',
  );
});

test("components preserve accessor props and receive children", () => {
  const Card = (props: { title: string; children?: SSRChild }) =>
    h("section", { title: () => props.title }, props.children);
  expect(
    renderToString(() =>
      h(
        Card,
        {
          get title() {
            return "<title>";
          },
        },
        h("span", null, "child"),
      ),
    ),
  ).toBe('<section title="&lt;title&gt;"><span>child</span></section>');
});

test("server entry runs signal/memo expressions and omits effects/event handlers", () => {
  let ran = 0;
  expect(
    renderToString(() => {
      const [count, set] = createSignal(1);
      const double = createMemo(() => count() * 2);
      createEffect(() => {
        ran++;
      });
      onMount(() => {
        ran++;
      });
      set(2);
      return h("input", {
        value: double,
        checked: true,
        onClick: () => {
          ran++;
        },
        get onclick() {
          ran++;
          return "bad";
        },
        ref: () => {
          ran++;
        },
      });
    }),
  ).toBe('<input value="4" checked="">');
  expect(ran).toBe(0);
});

test("textarea value is escaped content and factory HTML is never accepted as user text", () => {
  expect(
    renderToString(() =>
      h("textarea", { value: () => "</textarea><script>x</script>" }),
    ),
  ).toBe(
    "<textarea>&lt;/textarea&gt;&lt;script&gt;x&lt;/script&gt;</textarea>",
  );
  expect(() =>
    renderToString(
      () => ({ html: "<script>x</script>" }) as unknown as SSRChild,
    ),
  ).toThrow("Server children must be text or factory HTML");
});

test("server factory rejects malformed names, raw HTML, nonplain styles and void children", () => {
  expect(() => h("img onerror=bad")).toThrow("Invalid server element name");
  expect(() => h("div", { 'x" onclick': "bad" })).toThrow(
    "Invalid server attribute name",
  );
  expect(() => h("div", { style: new Date() })).toThrow("plain records");
  expect(() => h("div", { innerHTML: "<b>bad</b>" })).toThrow(
    "Raw server HTML",
  );
  expect(() => h("script", null, "alert(1)")).toThrow("script/style");
  expect(() => h("style", null, "body{}")).toThrow("script/style");
  expect(() => h("input", null, "child")).toThrow("cannot have children");
});

test("render disposes owned resources on success/failure and preserves render errors", () => {
  const cleanup: number[] = [];
  expect(
    renderToString(() => {
      onCleanup(() => {
        cleanup.push(1);
      });
      return h("p", null, "ok");
    }),
  ).toBe("<p>ok</p>");
  expect(() =>
    renderToString(() => {
      onCleanup(() => {
        cleanup.push(2);
        throw Error("cleanup");
      });
      throw Error("render");
    }),
  ).toThrow("render");
  expect(cleanup).toEqual([1, 2]);
});

test("input value and checked match DOM property coercion; raw text children reject HTML", () => {
  expect(renderToString(() => h("input", { value: false, checked: 0 }))).toBe(
    '<input value="false">',
  );
  expect(() => h("textarea", null, h("b", null, "bad"))).toThrow(
    "must be text",
  );
  expect(() => h("title", null, [() => h("span", null, "bad")])).toThrow(
    "must be text",
  );
});

test("textarea preserves a leading line feed for the HTML parser", () => {
  expect(renderToString(() => h("textarea", { value: "\nhello" }))).toBe(
    "<textarea>\n\nhello</textarea>",
  );
  expect(renderToString(() => h("textarea", null, "\n\nhello"))).toBe(
    "<textarea>\n\n\nhello</textarea>",
  );
});

test.each(["\r", "\r\n", "\n"])(
  "textarea protects a leading %j for live/default/child text",
  (newline) => {
    const value = newline + "hello";
    const expected = `<textarea>\n${value}</textarea>`;
    expect(renderToString(() => h("textarea", { value }))).toBe(expected);
    expect(renderToString(() => h("textarea", { defaultValue: value }))).toBe(
      expected,
    );
    expect(renderToString(() => h("textarea", null, value))).toBe(expected);
  },
);

test("select value marks the first matching option and overrides selected attributes", () => {
  expect(
    renderToString(() =>
      h(
        "select",
        { value: "b" },
        h("option", { value: "a", selected: true }, "a"),
        h("option", { value: "b" }, "b"),
        h("option", { value: "b", selected: true }, "duplicate"),
      ),
    ),
  ).toBe(
    '<select><option value="a">a</option><option value="b" selected="">b</option><option value="b">duplicate</option></select>',
  );
});

test("selection passes through optgroups and uses unescaped normalized option text", () => {
  const option = h("option", null, " \n a  & \t b \n ");
  const select = h(
    "select",
    { value: "a & b" },
    h("optgroup", { label: "group" }, option),
  );
  const expected =
    '<select><optgroup label="group"><option selected=""> \n a  &amp; \t b \n </option></optgroup></select>';
  expect(renderToString(() => select)).toBe(expected);
  expect(renderToString(() => select)).toBe(expected);
  expect(() => h("option", null, h("b", null, "nested"))).toThrow(
    "must be text",
  );
});

test("multiple select supports value arrays and single select rejects them", () => {
  expect(
    renderToString(() =>
      h(
        "select",
        { multiple: true, value: ["a", "c"] },
        ["a", "b", "c"].map((value) => h("option", { value }, value)),
      ),
    ),
  ).toBe(
    '<select multiple=""><option value="a" selected="">a</option><option value="b">b</option><option value="c" selected="">c</option></select>',
  );
  expect(() => h("select", { value: ["a"] })).toThrow("require multiple");
});

test("select without a value preserves explicit option selection", () => {
  expect(
    renderToString(() =>
      h("select", null, h("option", { selected: true }, "chosen")),
    ),
  ).toBe('<select><option selected="">chosen</option></select>');
});

test("unmatched single values reject serialization that would silently select the first option", () => {
  expect(() =>
    renderToString(() =>
      h("select", { value: "missing" }, h("option", { value: "a" }, "a")),
    ),
  ).toThrow("no matching option");
  expect(renderToString(() => h("select", { value: "missing" }))).toBe(
    "<select></select>",
  );
});

test("single-child normalization preserves accessors, arrays, validation and explicit precedence", () => {
  let reads = 0;
  expect(
    renderToString(() =>
      h("p", { children: "ignored" }, () => {
        reads++;
        return ["<&", h("b", null, "nested"), null];
      }),
    ),
  ).toBe("<p>&lt;&amp;<b>nested</b></p>");
  expect(reads).toBe(1);
  expect(renderToString(() => h("p", { children: "fallback" }))).toBe(
    "<p>fallback</p>",
  );
  expect(() => h("p", null, {} as SSRChild)).toThrow("text or factory HTML");
});

test("SSR styles serialize own CSS/custom properties with escaping and no implicit units", () => {
  const style = Object.assign(Object.create(null), {
    "background-color": "red",
    "--Case": '"<&>"',
    opacity: 0,
    width: 12,
    color: null,
    height: undefined,
  });
  Object.defineProperty(style, "hidden", { value: "not serialized" });
  expect(renderToString(() => h("div", { style: () => style }))).toBe(
    '<div style="background-color:red;--Case:&quot;&lt;&amp;&gt;&quot;;opacity:0;width:12;"></div>',
  );
  expect(
    renderToString(() =>
      h("p", { style: "color:red!important; --literal: ';';" }),
    ),
  ).toBe('<p style="color:red!important; --literal: &#39;;&#39;;"></p>');
});

test("SSR object styles reject declaration injection, unsupported names and invalid values eagerly", () => {
  for (const style of [
    { "color;display": "none" },
    { color: "red;display:none" },
    { color: "red!important" },
    { color: "red!\\69mportant" },
    { color: "red/* comment */" },
    { color: "red}" },
    { backgroundColor: "red" },
    { "--": "bad" },
    { color: false },
    { color: {} },
    { opacity: Infinity },
    { opacity: NaN },
    [],
    new Date(),
    new (class Style {
      color = "red";
    })(),
  ]) {
    expect(() => h("div", { style })).toThrow();
  }
});

test("whole style removal and empty property strings match DOM setProperty semantics", () => {
  for (const style of [null, undefined, false]) {
    expect(renderToString(() => h("div", { style }))).toBe("<div></div>");
  }
  expect(
    renderToString(() =>
      h("div", { style: { "--empty": "", color: null, opacity: 0 } }),
    ),
  ).toBe('<div style="opacity:0;"></div>');
  for (const style of [true, 1, () => true]) {
    expect(() => h("div", { style })).toThrow("CSS string");
  }
});

test("explicit defaults serialize as real form values and textarea text", () => {
  expect(
    renderToString(() =>
      h("input", {
        defaultValue: '<&"',
        defaultChecked: true,
        type: "checkbox",
      }),
    ),
  ).toBe('<input value="&lt;&amp;&quot;" checked="" type="checkbox">');
  expect(
    renderToString(() => h("textarea", { defaultValue: "\n<&" }, "ignored")),
  ).toBe("<textarea>\n\n&lt;&amp;</textarea>");
  for (const reverse of [false, true]) {
    const props = reverse
      ? {
          value: "live",
          defaultValue: "initial",
          checked: false,
          defaultChecked: true,
        }
      : {
          defaultValue: "initial",
          value: "live",
          defaultChecked: true,
          checked: false,
        };
    expect(renderToString(() => h("input", props))).toBe(
      '<input value="live">',
    );
    expect(
      renderToString(() =>
        h(
          "textarea",
          { value: props.value, defaultValue: props.defaultValue },
          "ignored",
        ),
      ),
    ).toBe("<textarea>live</textarea>");
  }
  expect(
    renderToString(() =>
      h("textarea", { value: undefined, defaultValue: "ignored" }, "ignored"),
    ),
  ).toBe("<textarea></textarea>");
  expect(
    renderToString(() =>
      h("input", { checked: undefined, defaultChecked: true }),
    ),
  ).toBe("<input>");
  expect(() => h("select", { defaultValue: "b" })).toThrow(
    "only on input and textarea",
  );
  expect(() => h("div", { defaultChecked: true })).toThrow("only on input");
});

test("multiple select nullish values select nothing while array entries stringify literally", () => {
  for (const value of [null, undefined]) {
    expect(
      renderToString(() =>
        h(
          "select",
          { multiple: true, value },
          h("option", { value: "" }, "empty"),
        ),
      ),
    ).toBe('<select multiple=""><option value="">empty</option></select>');
  }
  expect(
    renderToString(() =>
      h(
        "select",
        { multiple: true, value: [null, undefined] },
        h("option", { value: "" }, "empty"),
        h("option", { value: "null" }, "null"),
        h("option", { value: "undefined" }, "undefined"),
      ),
    ),
  ).toBe(
    '<select multiple=""><option value="">empty</option><option value="null" selected="">null</option><option value="undefined" selected="">undefined</option></select>',
  );
});

test("explicit textarea values suppress ignored accessor children and evaluate defaults once", () => {
  const ignored = () => {
    throw new Error("ignored child executed");
  };
  for (const props of [
    { value: undefined },
    { value: null },
    { defaultValue: undefined },
    { defaultValue: null },
  ]) {
    expect(renderToString(() => h("textarea", props, ignored))).toBe(
      "<textarea></textarea>",
    );
  }
  let reads = 0;
  expect(
    renderToString(() =>
      h(
        "textarea",
        {
          defaultValue: () => {
            reads++;
            return "notes";
          },
        },
        ignored,
      ),
    ),
  ).toBe("<textarea>notes</textarea>");
  expect(reads).toBe(1);
});

test("typed SSR select preserves raw identity and primitive types without changing plain h", () => {
  const first = {},
    second = {};
  expect(
    renderToString(() =>
      h(
        "select",
        { [selectBinding]: { value: second } },
        h("option", { [optionBinding]: { value: first } }, "first"),
        h("option", { [optionBinding]: { value: second } }, "second"),
      ),
    ),
  ).toBe(
    '<select><option value="[object Object]">first</option><option value="[object Object]" selected="">second</option></select>',
  );
  expect(
    renderToString(() =>
      h(
        "select",
        { [selectBinding]: { value: 2 } },
        h("option", { [optionBinding]: { value: "2" } }, "string"),
        h("option", { [optionBinding]: { value: 2 } }, "number"),
      ),
    ),
  ).toBe(
    '<select><option value="2">string</option><option value="2" selected="">number</option></select>',
  );
  expect(
    renderToString(() =>
      h(
        "select",
        { value: 2 },
        h("option", { value: "2" }, "string"),
        h("option", { value: 2 }, "number"),
      ),
    ),
  ).toBe(
    '<select><option value="2" selected="">string</option><option value="2">number</option></select>',
  );
});

test("typed SSR matching uses strict single equality and includes for multiple", () => {
  const option = (value: unknown) =>
    h("option", { [optionBinding]: { value } }, "item");
  const html = (value: unknown, multiple = false, ...values: unknown[]) =>
    renderToString(() =>
      h("select", { [selectBinding]: { value }, multiple }, values.map(option)),
    );
  expect(html(NaN, false, NaN)).toBe(
    '<select><option value="NaN">item</option></select>',
  );
  expect(html(-0, false, 0, -0).match(/selected/g)).toHaveLength(2);
  expect(html("a", false, "a", "a").match(/selected/g)).toHaveLength(2);
  expect(html("missing", false, "a")).toBe(
    '<select><option value="a">item</option></select>',
  );
  expect(html([NaN], true, NaN)).toBe(
    '<select multiple=""><option value="NaN" selected="">item</option></select>',
  );
  expect(html(null, false, null, undefined, "")).toBe(
    '<select><option selected="">item</option><option>item</option><option value="">item</option></select>',
  );
  expect(html(undefined, false, null, undefined, "")).toBe(
    '<select><option>item</option><option selected="">item</option><option value="">item</option></select>',
  );
  const array = [1];
  expect(html(array, false, array)).toBe(
    '<select><option value="1" selected="">item</option></select>',
  );
  // Svelte SSR falls back to scalar equality for a non-array multiple value.
  expect(html("a", true, "a")).toBe(
    '<select multiple=""><option value="a" selected="">item</option></select>',
  );
});

test("typed option payloads never invoke function values or overridden ordinary props", () => {
  let calls = 0;
  const value = () => {
    calls++;
    throw new Error("literal function");
  };
  expect(
    renderToString(() =>
      h(
        "select",
        {
          [selectBinding]: { value },
          get value() {
            throw new Error("ignored select value");
          },
        },
        h(
          "option",
          {
            [optionBinding]: { value },
            get value() {
              throw new Error("ignored ordinary value");
            },
          },
          "function",
        ),
      ),
    ),
  ).toBe('<select><option selected="">function</option></select>');
  expect(calls).toBe(0);
  expect(
    renderToString(() =>
      h(
        "select",
        { [selectBinding]: { value: '<&"' } },
        h(
          "optgroup",
          { label: "group" },
          h("option", { [optionBinding]: { value: '<&"' } }, "escaped"),
        ),
      ),
    ),
  ).toBe(
    '<select><optgroup label="group"><option value="&lt;&amp;&quot;" selected="">escaped</option></optgroup></select>',
  );
});

test("typed binding metadata validates boxed own data without invoking invalid payloads", () => {
  let calls = 0;
  const accessor = Object.defineProperty({}, "value", {
    get() {
      calls++;
      return 1;
    },
  });
  for (const box of [
    null,
    undefined,
    1,
    () => {
      calls++;
    },
    [],
    {},
    accessor,
    new Date(),
  ]) {
    expect(() => h("select", { [selectBinding]: box })).toThrow(
      "binding metadata",
    );
    expect(() => h("option", { [optionBinding]: box })).toThrow(
      "binding metadata",
    );
  }
  expect(calls).toBe(0);
  // Unrelated tags do not inspect compiler-specific symbols.
  expect(
    renderToString(() => h("div", { [selectBinding]: null }, "plain")),
  ).toBe("<div>plain</div>");
});

test("typed option serialization interoperates with ordinary string selects", () => {
  expect(
    renderToString(() =>
      h(
        "select",
        { value: "b" },
        h("option", { [optionBinding]: { value: "b" } }, "label"),
      ),
    ),
  ).toBe('<select><option value="b" selected="">label</option></select>');
});

test("SSR HTML boolean falsy values and translate booleans preserve SVG string attributes", () => {
  for (const value of [false, 0, -0, 0n, NaN, null, undefined]) {
    expect(
      renderToString(() => h("button", { disabled: value, hidden: value })),
    ).toBe("<button></button>");
    expect(renderToString(() => h("option", { selected: value }, "one"))).toBe(
      "<option>one</option>",
    );
    expect(
      renderToString(() =>
        h(
          "select",
          { multiple: value, value: "a" },
          h("option", { value: "a" }, "A"),
        ),
      ),
    ).toBe('<select><option value="a" selected="">A</option></select>');
  }
  for (const value of ["", "false"])
    expect(renderToString(() => h("button", { disabled: value }))).toContain(
      " disabled=",
    );
  expect(renderToString(() => h("div", { translate: false }))).toBe(
    '<div translate="no"></div>',
  );
  expect(renderToString(() => h("div", { translate: true }))).toBe(
    '<div translate="yes"></div>',
  );
  expect(renderToString(() => h("svg", { translate: false, hidden: 0 }))).toBe(
    '<svg translate="false" hidden="0"></svg>',
  );
});
