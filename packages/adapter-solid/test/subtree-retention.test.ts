import { expect, test } from "bun:test";
import "../../react/test/dom";
import { h, render } from "../src/dom";
import { createSignal, For, onCleanup } from "../src/solid";
import { createRenderEffect } from "@tschk/moonshine-dom/reactive";
test("removed row retains detached subtree but stops effects and owned listeners", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const [rows, setRows] = createSignal([1]),
    [value, setValue] = createSignal(0);
  let section!: HTMLElement,
    button!: HTMLElement,
    runs = 0,
    clicks = 0;
  const stop = render(
    () =>
      h(
        "main",
        null,
        For({
          get each() {
            return rows();
          },
          children: () => {
            button = h(
              "button",
              { onclick: () => clicks++ },
              "row",
            ) as HTMLElement;
            section = h("section", null, button) as HTMLElement;
            createRenderEffect(() => {
              value();
              runs++;
            });
            return section;
          },
        }),
      ),
    host,
  );
  button.click();
  expect(clicks).toBe(1);
  setRows([]);
  expect(section.parentNode).toBeNull();
  expect(button.parentNode).toBe(section);
  button.click();
  setValue(1);
  expect(clicks).toBe(1);
  expect(runs).toBe(1);
  stop();
  host.remove();
});
test("throwing cleanup drains physical roots and does not retain subsequent unrelated trees", () => {
  const host = document.createElement("div");
  document.body.append(host);
  let first!: HTMLElement;
  const error = Error("cleanup");
  const stop = render(() => {
    first = h("section", null, h("button", null, "first")) as HTMLElement;
    onCleanup(() => {
      throw error;
    });
    return first;
  }, host);
  expect(() => stop()).toThrow(error);
  expect(first.parentNode).toBeNull();
  expect(first.firstChild?.nodeName).toBe("BUTTON");
  const stopNext = render(() => h("section", null, h("i", null, "next")), host);
  stopNext();
  expect(host.childNodes.length).toBe(0);
  host.remove();
});
test("cleanup adoption retains moved children and replaces their old ownership", () => {
  const old = document.createElement("div"),
    next = document.createElement("div");
  document.body.append(old, next);
  let button!: HTMLElement;
  let stopNext = () => {};
  void stopNext;
  void stopNext;
  let clicks = 0;
  const stop = render(() => {
    button = h("button", { onclick: () => clicks++ }, "adopt") as HTMLElement;
    const section = h("section", null, button);
    onCleanup(() => {
      stopNext = render(() => button, next);
    });
    return section;
  }, old);
  stop();
  expect(next.firstChild).toBe(button);
  expect(button.isConnected).toBe(true);
  button.click();
  expect(clicks).toBe(0);
  stopNext();
  expect(button.parentNode).toBeNull();
  expect(old.childNodes.length).toBe(0);
  old.remove();
  next.remove();
});
