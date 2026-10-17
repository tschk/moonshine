import { expect, test } from "bun:test";
import "../../react/test/dom";
import { h, render } from "../src/dom";
import { createSignal, onCleanup, createRoot, lazy } from "../src/solid";
import { h as serverH, renderToString } from "../src/ssr";
test("nested arrays and accessor component results retain detached node trees with canceled resources", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const [read, set] = createSignal(0);
  let first!: HTMLElement, second!: HTMLElement;
  let updates = 0;
  function ArrayResult() {
    first = h(
      "section",
      null,
      h("button", null, () => {
        updates++;
        return read();
      }),
    ) as HTMLElement;
    return [[first]];
  }
  function AccessorResult() {
    second = document.createElement("section");
    second.append(h("i", null, "second") as Node);
    return () => [[second]];
  }
  const stop = render(
    () => [h(ArrayResult, {}), () => h(AccessorResult, {})],
    host,
  );
  expect(host.textContent).toBe("0second");
  stop();
  expect(first.parentNode).toBeNull();
  expect(first.firstChild?.nodeName).toBe("BUTTON");
  expect(second.firstChild?.nodeName).toBe("I");
  const before = updates;
  set(1);
  expect(updates).toBe(before);
  expect(host.childNodes.length).toBe(0);
  host.remove();
});
test("function factory and lazy reject ownerless setup before calling user factories", async () => {
  let calls = 0;
  function Component() {
    calls++;
    return h("p", null, "no");
  }
  expect(() => h(Component, {})).toThrow();
  expect(calls).toBe(0);
  const Lazy = lazy(async () => {
    calls++;
    return { default: Component };
  });
  expect(() => Lazy({})).toThrow();
  expect(calls).toBe(0);
  const failure = Error("load");
  const Failed = lazy(async () => {
    throw failure;
  });
  await expect(Failed.preload()).rejects.toBe(failure);
  await expect(Failed.preload()).rejects.toBe(failure);
  expect(calls).toBe(0);
});
test("failed component setup releases all partial children through its root owner", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const trace: string[] = [];
  function Broken() {
    onCleanup(() => trace.push("first"));
    h("button", null, "partial");
    onCleanup(() => trace.push("last"));
    throw Error("setup");
  }
  expect(() => render(() => h(Broken, {}), host)).toThrow("setup");
  expect(trace).toEqual(["last", "first"]);
  expect(host.childNodes.length).toBe(0);
  host.remove();
});
test("fresh SSR requests remain deterministic FIFO and restore outer client policy", () => {
  const trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => trace.push("client:first"));
    for (let i = 0; i < 2; i++)
      expect(
        renderToString(() => {
          onCleanup(() => trace.push("server:first"));
          onCleanup(() => trace.push("server:last"));
          return serverH("p", null, "<&");
        }),
      ).toBe("<p>&lt;&amp;</p>");
    onCleanup(() => trace.push("client:last"));
    return dispose;
  });
  stop();
  expect(trace).toEqual([
    "server:first",
    "server:last",
    "server:first",
    "server:last",
    "client:last",
    "client:first",
  ]);
});
