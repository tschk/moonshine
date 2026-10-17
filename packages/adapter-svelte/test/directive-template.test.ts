import { test, expect } from "bun:test";
import "../../react/test/dom";
import { h, render, templateBlock } from "@tschk/moonshine-dom/dom";
import {
  createRenderEffect,
  getOwner,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { withRuneScheduler } from "../src/pre";
import { createState } from "../src/state";
import { installAction, installAttachment } from "../src/directives";
import { onDestroy, tick } from "../src/svelte";

test("template directive destruction is child-owned and drains errors before component destroy", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const trace: unknown[] = [];
  const first = Error("action"),
    second = Error("attachment");
  let root!: HTMLElement;
  const state = createState(0);
  let reads = 0;
  function App() {
    return withRuneScheduler(() => {
      onDestroy(() =>
        trace.push(["component", root.isConnected, root.textContent]),
      );
      return templateBlock(() => {
        root = h("div", {});
        const text = document.createTextNode("");
        root.append(text);
        installAction(root, (node) => {
          trace.push("factory");
          return {
            destroy() {
              trace.push(["action", node.isConnected, node.textContent]);
              throw first;
            },
          };
        });
        installAttachment(root, () => (node) => {
          trace.push("attach");
          return () => {
            trace.push(["attachment", node.isConnected, node.textContent]);
            throw second;
          };
        });
        createRenderEffect(() => {
          reads++;
          text.data = String(state.value);
        });
        return root;
      });
    });
  }
  const stop = render(() => h(App, {}), host);
  await tick();
  expect(() => stop()).toThrow(first);
  expect(trace).toEqual([
    "factory",
    "attach",
    ["action", false, "0"],
    ["attachment", false, "0"],
    ["component", false, "0"],
  ]);
  state.value = 1;
  await tick();
  expect(reads).toBe(1);
  expect(host.childNodes.length).toBe(0);
  host.remove();
});

test("failed template setup and disposal before post factory cancel every factory", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const first = Error("setup");
  const trace: unknown[] = [];
  function App() {
    return withRuneScheduler(() =>
      templateBlock(() => {
        const root = h("div", {});
        installAction(root, () => {
          trace.push("factory");
        });
        onCleanup(() => trace.push("cleanup"));
        throw first;
      }),
    );
  }
  expect(() => render(() => h(App, {}), host)).toThrow(first);
  await tick();
  expect(trace).toEqual(["cleanup"]);
  expect(host.childNodes.length).toBe(0);
  const stop = render(
    () =>
      h(
        () =>
          withRuneScheduler(() =>
            templateBlock(() => {
              const root = h("div", {});
              installAction(root, () => {
                trace.push("late");
              });
              return root;
            }),
          ),
        {},
      ),
    host,
  );
  stop();
  await tick();
  expect(trace).toEqual(["cleanup"]);
  host.remove();
});

test("reentrant disposal inside factory destroys its returned payload once", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  let stop!: () => void;
  let node!: HTMLElement;
  const trace: unknown[] = [];
  function App() {
    return withRuneScheduler(() =>
      templateBlock(() => {
        node = h("div", {});
        node.append(document.createTextNode("retained"));
        installAction(node, (element) => {
          trace.push(["factory", element.isConnected]);
          stop();
          return {
            destroy() {
              trace.push(["destroy", element.isConnected, element.textContent]);
            },
          };
        });
        return node;
      }),
    );
  }
  stop = render(() => h(App, {}), host);
  await tick();
  stop();
  expect(trace).toEqual([
    ["factory", true],
    ["destroy", false, "retained"],
  ]);
  expect(host.childNodes.length).toBe(0);
  host.remove();
});

test("disposed construction never restores the original owner carrier", () => {
  let disposedOwner: ReturnType<typeof getOwner>;
  const host = document.createElement("div");
  function App() {
    return withRuneScheduler(() =>
      templateBlock(() => {
        disposedOwner = getOwner();
        throw Error("failure");
      }),
    );
  }
  expect(() => render(() => h(App, {}), host)).toThrow("failure");
  expect(disposedOwner!.context).toBeUndefined();
  expect(disposedOwner!.disposed).toBe(true);
});
