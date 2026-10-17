import { getComponentContext } from "@tschk/moonshine-dom/component";
import { afterEach, expect, test } from "bun:test";
import { createContext, useContext, Show, For } from "../src/solid";
import {
  createRoot,
  createSignal,
  onCleanup,
  getOwner,
  createComputed,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as ssrH, defer, renderToString } from "@tschk/moonshine-dom/ssr";
import "../../react/test/dom";
let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

test("Solid contexts default, nest, isolate siblings and preserve retained control owners", () => {
  const Context = createContext("default");
  const [shown, setShown] = createSignal(true),
    [items, setItems] = createSignal([1, 2]);
  let setups = 0,
    cleanups = 0;
  const Child = ({ id }: { id: number }) => {
    setups++;
    const value = useContext(Context);
    onCleanup(() => cleanups++);
    return h("i", null, `${value}/${id}`);
  };
  const container = document.createElement("div");
  document.body.append(container);
  stop = render(
    () =>
      h(
        "section",
        null,
        h(Context.Provider, {
          value: "parent",
          get children() {
            return [
              Show({
                get when() {
                  return shown();
                },
                children: (_value) => h(Child, { id: 0 }),
              }),
              For({
                get each() {
                  return items();
                },
                children: (id) => h(Child, { id }),
              }),
              h(Context.Provider, {
                value: undefined as unknown as string,
                get children() {
                  return h("b", null, useContext(Context));
                },
              }),
            ];
          },
        }),
        h("span", null, useContext(Context)),
      ),
    container,
  );
  expect(container.textContent).toBe("parent/0parent/1parent/2defaultdefault");
  const first = container.querySelectorAll("i")[1];
  setItems([2, 1]);
  expect(container.querySelectorAll("i")[2]).toBe(first);
  setShown(false);
  setShown(true);
  expect(setups).toBe(4);
  expect(cleanups).toBe(1);
  stop();
  expect(cleanups).toBe(4);
  expect(useContext(Context)).toBe("default");
});

test("Provider captures value once untracked and restores owner after child failure", () => {
  const Context = createContext("default");
  const [value, setValue] = createSignal("first");
  let reads = 0,
    consumer = 0;
  stop = createRoot((dispose) => {
    const owner = getOwner();
    createComputed(() =>
      Context.Provider({
        get value() {
          reads++;
          return value();
        },
        get children() {
          consumer++;
          return useContext(Context);
        },
      }),
    );
    setValue("second");
    expect([reads, consumer]).toEqual([1, 1]);
    expect(() =>
      Context.Provider({
        value: "bad",
        get children() {
          onCleanup(() => {
            throw Error("cleanup");
          });
          throw Error("child");
        },
      }),
    ).toThrow("child");
    expect(getOwner()).toBe(owner);
    expect(useContext(Context)).toBe("default");
    return dispose;
  });
});

test("SSR contexts inherit into deferred descendants and isolate requests", () => {
  const Context = createContext("default");
  const Child = () =>
    ssrH("i", null, `${useContext(Context)}/${getOwner()?.disposed}`);
  const App = ({ value }: { value: string }) =>
    ssrH(Context.Provider, {
      value,
      get children() {
        return ssrH(
          "section",
          null,
          defer(() => ssrH(Child, {})),
        );
      },
    });
  expect(renderToString(() => ssrH(App, { value: "first" }))).toBe(
    "<section><i>first/false</i></section>",
  );
  expect(renderToString(() => ssrH(App, { value: "second" }))).toBe(
    "<section><i>second/false</i></section>",
  );
  expect(useContext(Context)).toBe("default");
});

test("context defaults and nested undefined match installed Solid browser runtime", async () => {
  const reference =
    await import("../../../node_modules/.bun/solid-js@1.9.14/node_modules/solid-js/dist/solid.js");
  function exercise(api: any) {
    const Context = api.createContext("default");
    const seen: string[] = [];
    api.createRoot((dispose: () => void) => {
      seen.push(api.useContext(Context));
      const value = Context.Provider({
        value: "parent",
        get children() {
          seen.push(api.useContext(Context));
          return Context.Provider({
            value: undefined,
            get children() {
              seen.push(api.useContext(Context));
              return "body";
            },
          });
        },
      });
      value();
      seen.push(api.useContext(Context));
      dispose();
    });
    return seen;
  }
  expect(exercise({ createContext, useContext, createRoot })).toEqual(
    exercise(reference),
  );
});

test("SSR providers scope direct deferred arrays and text consumers through complete serialization", () => {
  const Context = createContext("default");
  const modes: string[] = [];
  const Child = () => {
    modes.push(getComponentContext().mode);
    return [
      ssrH("i", null, useContext(Context)),
      defer(() => ssrH("b", null, useContext(Context))),
    ];
  };
  const App = ({ value }: { value: string }) =>
    ssrH(Context.Provider, {
      value,
      get children() {
        return [
          defer(() => ssrH(Child, {})),
          () => ssrH("title", null, () => useContext(Context)),
          () => ssrH("textarea", null, () => useContext(Context)),
        ];
      },
    });
  expect(renderToString(() => ssrH(App, { value: "first" }))).toBe(
    "<i>first</i><b>first</b><title>first</title><textarea>first</textarea>",
  );
  expect(renderToString(() => ssrH(App, { value: "second" }))).toBe(
    "<i>second</i><b>second</b><title>second</title><textarea>second</textarea>",
  );
  expect(modes).toEqual(["ssr", "ssr"]);
});

test("SSR deferred provider failures restore context and clean each request once", () => {
  const Context = createContext("default");
  const failure = Error("deferred child");
  let cleanups = 0;
  const Child = () => {
    expect(useContext(Context)).toBe("request");
    onCleanup(() => cleanups++);
    throw failure;
  };
  expect(() =>
    renderToString(() =>
      ssrH(Context.Provider, {
        value: "request",
        get children() {
          return defer(() => ssrH(Child, {}));
        },
      }),
    ),
  ).toThrow(failure);
  expect(cleanups).toBe(1);
  expect(getOwner()).toBeNull();
  expect(useContext(Context)).toBe("default");
  expect(
    renderToString(() =>
      ssrH(Context.Provider, {
        value: "next",
        get children() {
          return defer(() => ssrH("p", null, useContext(Context)));
        },
      }),
    ),
  ).toBe("<p>next</p>");
});
