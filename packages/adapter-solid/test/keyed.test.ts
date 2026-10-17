import { afterEach, expect, test } from "bun:test";
import { Show, Match, Switch, createContext, useContext } from "../src/solid";
import {
  createRoot,
  createSignal,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as ssrH, renderToString } from "@tschk/moonshine-dom/ssr";
import "../../react/test/dom";
let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

test("keyed Show recreates truthy identity with cleanup before setup while ordinary Show retains", () => {
  for (const keyed of [false, true] as const) {
    const first = { id: "a" },
      second = { id: "b" };
    const [value, set] = createSignal<object | false>(first);
    const trace: string[] = [];
    stop = createRoot((dispose) => {
      const props: any = {
        get when() {
          return value();
        },
        keyed,
        children(item: any) {
          const id = (keyed ? item : item()).id;
          trace.push(`setup:${id}`);
          onCleanup(() => trace.push(`cleanup:${id}`));
          return id;
        },
        get fallback() {
          trace.push("fallback");
          return "empty";
        },
      };
      const selected = Show(props);
      expect(selected()).toBe("a");
      set(second);
      expect(selected()).toBe(keyed ? "b" : "a");
      set(second);
      selected();
      set(false);
      expect(selected()).toBe("empty");
      set(second);
      expect(selected()).toBe("b");
      dispose();
      return dispose;
    });
    expect(trace).toEqual(
      keyed
        ? [
            "setup:a",
            "cleanup:a",
            "setup:b",
            "cleanup:b",
            "fallback",
            "setup:b",
            "cleanup:b",
          ]
        : ["setup:a", "cleanup:a", "fallback", "setup:b", "cleanup:b"],
    );
  }
});

test("mixed Switch keyed Match preserves first priority, raw values and provider ownership", () => {
  const Context = createContext("default"),
    a = { id: "a" },
    b = { id: "b" };
  const [value, set] = createSignal<typeof a | false>(a),
    [priority, setPriority] = createSignal(false);
  const trace: string[] = [];
  const container = document.createElement("div");
  document.body.append(container);
  const Child = ({ value }: { value: typeof a }) => {
    const label = useContext(Context) + value.id;
    trace.push(`setup:${label}`);
    onCleanup(() => trace.push(`cleanup:${label}`));
    return h("button", null, label);
  };
  stop = render(
    () =>
      h(Context.Provider, {
        value: "ctx:",
        get children() {
          return Switch({
            children: [
              Match({
                get when() {
                  return priority();
                },
                children: "priority",
              }),
              Match({
                get when() {
                  return value();
                },
                keyed: true,
                children: (item) => h(Child, { value: item }),
              }),
            ],
            fallback: "empty",
          });
        },
      }),
    container,
  );
  const initial = container.querySelector("button");
  set(a);
  expect(container.querySelector("button")).toBe(initial);
  set(b);
  expect(container.textContent).toBe("ctx:b");
  expect(container.querySelector("button") === initial).toBe(false);
  setPriority(true);
  expect(container.textContent).toBe("priority");
  set(a);
  expect(container.textContent).toBe("priority");
  setPriority(false);
  expect(container.textContent).toBe("ctx:a");
  set(false);
  expect(container.textContent).toBe("empty");
  expect(trace).toEqual([
    "setup:ctx:a",
    "cleanup:ctx:a",
    "setup:ctx:b",
    "cleanup:ctx:b",
    "setup:ctx:a",
    "cleanup:ctx:a",
  ]);
});

test("keyed callbacks clean failed setup, preserve original error and recover", () => {
  const [value, set] = createSignal(1);
  let cleanups = 0;
  stop = createRoot((dispose) => {
    const selected = Show({
      get when() {
        return value();
      },
      keyed: true,
      children: (item) => {
        onCleanup(() => {
          cleanups++;
          if (item === 2) throw Error("cleanup");
        });
        if (item === 2) throw Error("child");
        return item;
      },
    });
    expect(selected()).toBe(1);
    expect(() => set(2)).toThrow("child");
    set(3);
    expect(selected()).toBe(3);
    return dispose;
  });
  stop();
  expect(cleanups).toBe(3);
});

test("keyed controls serialize independently in SSR without exposing accessor values", () => {
  const App = ({ id }: { id: string }) =>
    ssrH(
      "section",
      null,
      Show({
        when: { id },
        keyed: true,
        children: (item) => ssrH("i", null, item.id),
      }),
      Switch({
        children: Match({
          when: id,
          keyed: true,
          children: (item) => ssrH("b", null, item),
        }),
      }),
    );
  expect(renderToString(() => ssrH(App, { id: "first" }))).toBe(
    "<section><i>first</i><b>first</b></section>",
  );
  expect(renderToString(() => ssrH(App, { id: "second" }))).toBe(
    "<section><i>second</i><b>second</b></section>",
  );
});

test("keyed Show and mixed Switch traces match installed Solid browser runtime", async () => {
  const pkg = Bun.resolveSync("solid-js/package.json", import.meta.dir);
  const reference = await import(
    new URL("./dist/solid.js", `file://${pkg}`).pathname
  );
  function exercise(api: any, keyed: boolean, switchMode: boolean) {
    const trace: string[] = [];
    api.createRoot((dispose: () => void) => {
      const a = { id: "a" },
        b = { id: "b" };
      const [read, write] = api.createSignal(a);
      const props = {
        get when() {
          return read();
        },
        keyed,
        children(value: any) {
          const id = (keyed ? value : value()).id;
          trace.push(`setup:${id}`);
          api.onCleanup(() => trace.push(`cleanup:${id}`));
          return id;
        },
        get fallback() {
          trace.push("fallback");
          return "empty";
        },
      };
      const selected = switchMode
        ? api.Switch({
            children: api.Match(props),
            get fallback() {
              return props.fallback;
            },
          })
        : api.Show(props);
      selected();
      for (const value of [b, b, false, a]) {
        write(value);
        selected();
      }
      dispose();
    });
    return trace;
  }
  for (const keyed of [false, true])
    for (const switchMode of [false, true])
      expect(
        exercise(
          { Show, Match, Switch, createRoot, createSignal, onCleanup },
          keyed,
          switchMode,
        ),
      ).toEqual(exercise(reference, keyed, switchMode));
});
