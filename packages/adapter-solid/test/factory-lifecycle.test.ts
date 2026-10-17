import { expect, test } from "bun:test";
import "../../react/test/dom";
import { h, render } from "../src/dom";
import { createRoot, onCleanup, createSignal, lazy } from "../src/solid";
import { Dynamic } from "../src/dynamic";
import { getOwner } from "@tschk/moonshine-dom/reactive";
import { getComponentContext } from "@tschk/moonshine-dom/component";
test("public DOM factory shares owner while keeping temporary frames and connected cleanup order", () => {
  const trace: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  let parentOwner: unknown;
  function Child(p: { id: string }) {
    expect(getOwner()).toBe(parentOwner);
    expect(getComponentContext().props).toBe(p);
    const node = h("button", null, p.id);
    onCleanup(() => trace.push(p.id + ":first:" + node.isConnected));
    onCleanup(() => trace.push(p.id + ":last:" + node.isConnected));
    return node;
  }
  function Parent() {
    parentOwner = getOwner();
    onCleanup(() => trace.push("before"));
    const a = h(Child, { id: "a" }),
      b = h(Child, { id: "b" });
    onCleanup(() => trace.push("after"));
    return h("section", null, a, b);
  }
  const stop = render(() => h(Parent, {}), host);
  stop();
  expect(trace).toEqual([
    "after",
    "b:last:true",
    "b:first:true",
    "a:last:true",
    "a:first:true",
    "before",
  ]);
  expect(host.querySelector("button")).toBeNull();
  host.remove();
});
test("Dynamic component callbacks own the selection memo without a second component scope", () => {
  const trace: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  function A() {
    const node = h("i", null, "a");
    onCleanup(() => trace.push("a:first:" + node.isConnected));
    onCleanup(() => trace.push("a:last:" + node.isConnected));
    return node;
  }
  function B() {
    const node = h("b", null, "b");
    onCleanup(() => trace.push("b:first:" + node.isConnected));
    onCleanup(() => trace.push("b:last:" + node.isConnected));
    return node;
  }
  const [read, set] = createSignal<typeof A | undefined>(A);
  const stop = render(
    () =>
      Dynamic({
        get component() {
          return read();
        },
      }),
    host,
  );
  set(() => B);
  expect(trace).toEqual(["a:last:true", "a:first:true"]);
  expect(host.textContent).toBe("b");
  stop();
  expect(trace).toEqual([
    "a:last:true",
    "a:first:true",
    "b:last:true",
    "b:first:true",
  ]);
  host.remove();
});
test("lazy loaded and preloaded components keep independent selected owners and cleanup order", async () => {
  const trace: string[] = [];
  function Component(p: { id: string }) {
    const node = h("button", null, p.id);
    onCleanup(() => trace.push(p.id + ":first:" + node.isConnected));
    onCleanup(() => trace.push(p.id + ":last:" + node.isConnected));
    return node;
  }
  const Lazy = lazy(async () => ({ default: Component }));
  await Lazy.preload();
  const one = document.createElement("div"),
    two = document.createElement("div");
  document.body.append(one, two);
  const stopOne = render(() => h(Lazy, { id: "one" }), one),
    stopTwo = render(() => h(Lazy, { id: "two" }), two);
  stopOne();
  expect(trace).toEqual(["one:last:true", "one:first:true"]);
  expect(two.textContent).toBe("two");
  stopTwo();
  expect(trace.slice(-2)).toEqual(["two:last:true", "two:first:true"]);
  one.remove();
  two.remove();
});
test("public Solid root reverses independently while native default root remains unchanged", () => {
  const trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => trace.push("first"));
    onCleanup(() => trace.push("last"));
    return dispose;
  });
  stop();
  expect(trace).toEqual(["last", "first"]);
});
