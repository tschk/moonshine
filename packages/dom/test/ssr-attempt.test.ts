import { expect, test } from "bun:test";
import {
  afterRender,
  defer,
  h,
  renderToString,
  settle,
  onCleanup,
  getOwner,
  createRoot,
  selectBinding,
  optionBinding,
} from "../src/ssr";
import {
  captureSSRRenderAttempt,
  isSSRRenderAccepted,
} from "../src/ssr-attempt";

test("settlement retries only template output and retains only accepted public cleanup", () => {
  let setups = 0,
    templates = 0,
    internal = 0;
  const destroyed: number[] = [];
  function Child(props: {
    getValue: () => number | undefined;
    setValue: (value: number) => void;
  }) {
    const value = props.getValue() ?? 3;
    const attempt = captureSSRRenderAttempt();
    onCleanup(() => {
      internal++;
      if (isSSRRenderAccepted(attempt)) destroyed.push(value);
    });
    return afterRender(h("b", null, value), () => {
      if (props.getValue() === undefined) props.setValue(value);
    });
  }
  function Parent() {
    setups++;
    let value: number | undefined;
    return settle((invalidate) => {
      templates++;
      return [
        h("p", null, `before:${value ?? ""}`),
        defer(() =>
          h(Child, {
            getValue: () => value,
            setValue: (next) => {
              value = next;
              invalidate();
            },
          }),
        ),
        h("p", null, `after:${value ?? ""}`),
      ];
    });
  }
  expect(renderToString(() => h(Parent, {}))).toBe(
    "<p>before:3</p><b>3</b><p>after:3</p>",
  );
  expect([setups, templates, internal]).toEqual([1, 2, 2]);
  expect(destroyed).toEqual([3]);
});

test("nested accepted attempts are discarded when an enclosing template retries", () => {
  const cleanup: string[] = [];
  let parentValue: number | undefined;
  function Child() {
    let value: number | undefined;
    const own = captureSSRRenderAttempt();
    onCleanup(() => {
      if (isSSRRenderAccepted(own)) cleanup.push("child");
    });
    return afterRender(
      settle((invalidate) =>
        defer(() => {
          const nested = captureSSRRenderAttempt();
          onCleanup(() => {
            if (isSSRRenderAccepted(nested)) cleanup.push("grand");
          });
          return afterRender(h("b", null, value ?? 3), () => {
            if (value === undefined) {
              value = 3;
              invalidate();
            }
          });
        }),
      ),
      () => {
        if (parentValue === undefined) {
          parentValue = value;
          parentInvalidate();
        }
      },
    );
  }
  let parentInvalidate = () => {};
  expect(
    renderToString(() =>
      settle((invalidate) => {
        parentInvalidate = invalidate;
        return [h("i", null, parentValue), h(Child, {})];
      }),
    ),
  ).toBe("<i>3</i><b>3</b>");
  expect(cleanup).toEqual(["grand", "child"]);
});

test("afterRender commits only successful children and failures clean scopes without masking errors", () => {
  const failure = new Error("render failed");
  let commits = 0,
    cleanups = 0;
  expect(() =>
    renderToString(() =>
      settle(() => {
        onCleanup(() => {
          cleanups++;
          throw Error("cleanup failed");
        });
        return afterRender(
          defer(() => {
            throw failure;
          }),
          () => commits++,
        );
      }),
    ),
  ).toThrow(failure);
  expect([commits, cleanups]).toEqual([0, 1]);
  expect(getOwner()).toBeNull();
  expect(
    renderToString(() => afterRender(h("p", null, "safe<&"), () => commits++)),
  ).toBe("<p>safe&lt;&amp;</p>");
  expect(commits).toBe(1);
});

test("retry selection is transactional and SVG/text escaping remains contextual", () => {
  let pass = 0;
  const selected = { id: 1 };
  expect(
    renderToString(() =>
      h(
        "select",
        { [selectBinding]: { value: selected } },
        settle((invalidate) =>
          afterRender(
            h("option", { [optionBinding]: { value: selected } }, "<&"),
            () => {
              if (++pass === 1) invalidate();
            },
          ),
        ),
      ),
    ),
  ).toBe(
    '<select><option value="[object Object]" selected="">&lt;&amp;</option></select>',
  );
  expect(pass).toBe(2);
  let ordinaryPass = 0;
  expect(
    renderToString(() =>
      h(
        "select",
        { value: "chosen" },
        settle((invalidate) =>
          afterRender(h("option", { value: "chosen" }, "chosen"), () => {
            if (!ordinaryPass++) invalidate();
          }),
        ),
      ),
    ),
  ).toBe('<select><option value="chosen" selected="">chosen</option></select>');
  let emptyPass = 0;
  expect(
    renderToString(() =>
      h(
        "select",
        { value: "chosen" },
        settle((invalidate) => {
          if (emptyPass++) return "";
          invalidate();
          return h("option", { value: "discarded" }, "discarded");
        }),
      ),
    ),
  ).toBe("<select></select>");
  expect(
    renderToString(() =>
      h(
        "svg",
        null,
        settle(() => h("g", { hidden: false }, h("text", null, "<&"))),
      ),
    ),
  ).toBe('<svg><g hidden="false"><text>&lt;&amp;</text></g></svg>');
  expect(() =>
    renderToString(() =>
      h(
        "textarea",
        null,
        settle(() => "text"),
      ),
    ),
  ).toThrow("must be text");
});

test("settlement limits retries, validates ownership and isolates independent requests", () => {
  expect(() => settle(() => "outside")).toThrow("live native owner");
  let cleanups = 0;
  expect(() =>
    renderToString(() =>
      settle((invalidate) => {
        onCleanup(() => cleanups++);
        invalidate();
        return "never";
      }),
    ),
  ).toThrow("update limit");
  expect(cleanups).toBe(1000);
  for (const value of ["<one>", "<two>"]) {
    let passes = 0;
    expect(
      renderToString(() =>
        settle((invalidate) => {
          if (!passes++) invalidate();
          return h("p", null, value);
        }),
      ),
    ).toBe(`<p>&lt;${value.slice(1, -1)}&gt;</p>`);
    expect(passes).toBe(2);
  }
});

test("settlement never adopts work after its captured owner is disposed", () => {
  let cleaned = 0;
  createRoot((stop) => {
    const child = settle(() => {
      onCleanup(() => cleaned++);
      stop();
      return "discarded";
    });
    expect(() => renderToString(() => child)).toThrow("owner was disposed");
  });
  expect(cleaned).toBe(1);
  expect(getOwner()).toBeNull();
});

test("serializer and settlement run without browser globals", async () => {
  const module = new URL("../src/ssr.ts", import.meta.url).pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `import{h,settle,afterRender,renderToString}from${JSON.stringify(module)};if(typeof document!=='undefined')throw Error('unexpected DOM');let count=0;const result=renderToString(()=>settle(invalidate=>afterRender(h('p',null,'safe<&'),()=>{if(!count++)invalidate()})));console.log(result);`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  expect(output.trim()).toBe("<p>safe&lt;&amp;</p>");
});
