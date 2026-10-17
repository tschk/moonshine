import { expect, test } from "bun:test";
import {
  h,
  defer,
  renderToString,
  scopeSSRChild,
  type SSRChild,
} from "../src/ssr";
import { getContext, setContext } from "../src/component";
import { createRoot, getOwner, onCleanup } from "../src/reactive";
import { isSSRRendering } from "../src/ssr-owner";

test("scoped deferred children preserve provider context and request cleanup", () => {
  const cleaned: string[] = [];
  let previous!: SSRChild;
  function Leaf() {
    const name = getContext<string>("name")!;
    onCleanup(() => cleaned.push(name));
    return h("p", null, name);
  }
  function Provider({ name }: { name: string }) {
    setContext("name", name);
    return (previous = scopeSSRChild(defer(() => h(Leaf, {}))));
  }
  for (let request = 0; request < 2; request++) {
    expect(
      renderToString(() =>
        h("main", null, h(Provider, { name: "a" }), h(Provider, { name: "b" })),
      ),
    ).toBe("<main><p>a</p><p>b</p></main>");
    expect(cleaned).toHaveLength((request + 1) * 2);
  }
  expect(cleaned).toEqual(["a", "b", "a", "b"]);
  expect(() => renderToString(() => previous)).toThrow(
    "disposed SSR child scope",
  );
});

test("scoped arrays and text preserve select state, namespaces and escaping", () => {
  expect(
    renderToString(() =>
      h(
        "select",
        { value: "b" },
        scopeSSRChild([
          h("option", { value: "a" }, "A"),
          h(
            "option",
            null,
            scopeSSRChild(() => ["b"]),
          ),
        ]),
      ),
    ),
  ).toBe(
    '<select><option value="a">A</option><option selected="">b</option></select>',
  );
  expect(
    renderToString(() =>
      h(
        "svg",
        null,
        scopeSSRChild([h("g", { hidden: false }, h("text", null, "<&"))]),
      ),
    ),
  ).toBe('<svg><g hidden="false"><text>&lt;&amp;</text></g></svg>');
  expect(
    renderToString(() =>
      h(
        "textarea",
        null,
        scopeSSRChild(() => ["<&", 3]),
      ),
    ),
  ).toBe("<textarea>&lt;&amp;3</textarea>");
  expect(() =>
    renderToString(() =>
      h("textarea", null, scopeSSRChild(h("b", null, "markup"))),
    ),
  ).toThrow("must be text");
});

test("scoped serialization restores ownership after failure and rejects raw objects", () => {
  const failure = new Error("deferred child");
  let cleaned = 0;
  createRoot((stop) => {
    const outer = getOwner();
    expect(() =>
      renderToString(() =>
        scopeSSRChild(
          defer(() => {
            onCleanup(() => cleaned++);
            throw failure;
          }),
        ),
      ),
    ).toThrow(failure);
    expect(getOwner()).toBe(outer);
    expect(cleaned).toBe(1);
    expect(() => renderToString(() => scopeSSRChild({} as SSRChild))).toThrow(
      "text or factory HTML",
    );
    expect(getOwner()).toBe(outer);
    stop();
  });
  expect(() => scopeSSRChild("outside")).toThrow("live native owner");
});

test("SSR mode covers bare callbacks, nested renders, foreign scopes and request cleanup", async () => {
  expect(isSSRRendering()).toBe(false);
  let stopped = false;
  let later!: Promise<boolean>;
  const stop = createRoot((dispose) => {
    const foreign = scopeSSRChild(() => {
      expect(isSSRRendering()).toBe(true);
      return "foreign";
    });
    expect(
      renderToString(() => {
        expect(isSSRRendering()).toBe(true);
        onCleanup(() => {
          expect(isSSRRendering()).toBe(true);
          stopped = true;
        });
        expect(renderToString(() => "nested")).toBe("nested");
        expect(isSSRRendering()).toBe(true);
        later = Promise.resolve().then(isSSRRendering);
        return [foreign, h("p", null, "<&")];
      }),
    ).toBe("foreign<p>&lt;&amp;</p>");
    expect(isSSRRendering()).toBe(false);
    return dispose;
  });
  expect(stopped).toBe(true);
  expect(await later).toBe(false);
  expect(isSSRRendering()).toBe(false);
  stop();
});

test("SSR mode restores after rendering and cleanup failures while preserving the render error", () => {
  const renderError = Error("render"),
    cleanupError = Error("cleanup");
  expect(() =>
    renderToString(() => {
      onCleanup(() => {
        expect(isSSRRendering()).toBe(true);
        throw cleanupError;
      });
      throw renderError;
    }),
  ).toThrow(renderError);
  expect(isSSRRendering()).toBe(false);
  expect(() =>
    renderToString(() => {
      onCleanup(() => {
        expect(isSSRRendering()).toBe(true);
        throw cleanupError;
      });
      return "ok";
    }),
  ).toThrow(cleanupError);
  expect(isSSRRendering()).toBe(false);
});
