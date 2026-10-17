import { afterEach, expect, test } from "bun:test";
import { children } from "../src/solid";
import {
  createRoot,
  createSignal,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import "../../react/test/dom";
let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

test("children normalize cached nested accessors and preserve parameterized callbacks", () => {
  const [n, set] = createSignal(1);
  let outer = 0,
    inner = 0;
  const callback = (value: number) => value;
  stop = createRoot((dispose) => {
    const resolved = children(() => {
      outer++;
      return [
        () => {
          inner++;
          return n();
        },
        [null, false, callback],
      ] as const;
    });
    const initial = resolved();
    expect(initial).toEqual([1, null, false, callback]);
    expect(resolved()).toBe(initial);
    expect(resolved.toArray()).toBe(initial);
    set(2);
    expect(resolved()).toEqual([2, null, false, callback]);
    expect([outer, inner]).toEqual([1, 2]);
    for (const value of [null, undefined, false, 0, ""]) {
      expect(children(() => value).toArray()).toEqual(
        value == null ? [] : [value],
      );
    }
    return dispose;
  });
});

test("wrapper children retain browser nodes and setup while dynamic text updates", () => {
  const [value, set] = createSignal(1);
  let setups = 0,
    cleanups = 0,
    getters = 0;
  const Child = () => {
    setups++;
    onCleanup(() => cleanups++);
    return h("button", null, value);
  };
  const Wrapper = (props: { children?: unknown }) => {
    const resolved = children(() => props.children);
    return h("section", null, resolved);
  };
  const container = document.createElement("div");
  document.body.append(container);
  stop = render(
    () =>
      h(Wrapper, {
        get children() {
          getters++;
          return h(Child, {});
        },
      }),
    container,
  );
  const node = container.querySelector("button");
  node!.focus();
  set(2);
  expect(container.textContent).toBe("2");
  expect(container.querySelector("button")).toBe(node);
  expect(document.activeElement).toBe(node);
  expect([setups, getters, cleanups]).toEqual([1, 1, 0]);
  stop();
  expect(cleanups).toBe(1);
});

test("children owned accessor failures clean failed work and recover on dependency changes", () => {
  const [value, set] = createSignal(1);
  let cleanups = 0;
  stop = createRoot((dispose) => {
    const resolved = children(() => () => {
      const current = value();
      onCleanup(() => cleanups++);
      if (current === 2) throw Error("child");
      return current;
    });
    expect(resolved()).toBe(1);
    expect(() => set(2)).toThrow("child");
    expect(cleanups).toBe(2);
    set(3);
    expect(resolved()).toBe(3);
    return dispose;
  });
  stop();
  expect(cleanups).toBe(3);
});

test("children resolution matches installed Solid browser runtime", async () => {
  const pkg = Bun.resolveSync("solid-js/package.json", import.meta.dir);
  const reference = await import(
    new URL("./dist/solid.js", `file://${pkg}`).pathname
  );
  function exercise(api: any) {
    return api.createRoot((dispose: () => void) => {
      const [read, write] = api.createSignal(1);
      let outer = 0,
        inner = 0;
      const callback = (value: number) => value;
      const resolved = api.children(() => {
        outer++;
        return [
          () => {
            inner++;
            return read();
          },
          [null, false, callback],
        ];
      });
      const first = resolved(),
        same = first === resolved();
      write(2);
      const next = resolved();
      const output = {
        first: first.slice(0, 3),
        next: next.slice(0, 3),
        same,
        outer,
        inner,
        callback: next[3] === callback,
        arrays: [null, undefined, false, 0, ""].map((value) =>
          api.children(() => value).toArray(),
        ),
      };
      dispose();
      return output;
    });
  }
  expect(exercise({ children, createRoot, createSignal })).toEqual(
    exercise(reference),
  );
});
