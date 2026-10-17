import { expect, spyOn, test } from "bun:test";
import { registerSolidEvent } from "../src/events";
import "../../react/test/dom";
test("delegated registration changes handlers without reacquiring document and preserves tuple receiver", () => {
  const node = document.createElement("button");
  document.body.append(node);
  const add = spyOn(document, "addEventListener"),
    remove = spyOn(document, "removeEventListener");
  const calls: unknown[] = [];
  const click = () => node.click();
  const first = function (this: Element, event: Event) {
    calls.push([this === node, event.type]);
  };
  const registration = registerSolidEvent(node, "onClick", first);
  try {
    click();
    expect(
      registration.update?.(function (this: Element, event: Event) {
        calls.push(["next", this === node, event.type]);
      }),
    ).toBe(true);
    click();
    expect(
      registration.update?.([
        function (this: Element, data: unknown, event: Event) {
          calls.push([data, this === node, event.type]);
        },
        "payload",
      ]),
    ).toBe(true);
    click();
    expect(calls).toEqual([
      [true, "click"],
      ["next", true, "click"],
      ["payload", true, "click"],
    ]);
    expect(add.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === "click")).toHaveLength(
      0,
    );
    for (const value of [null, { handleEvent() {} }, [], 1])
      expect(registration.update?.(value)).toBe(false);
    registration();
    registration();
    click();
    expect(calls).toHaveLength(3);
    expect(remove.mock.calls.filter(([type]) => type === "click")).toHaveLength(
      1,
    );
    expect(registration.update?.(first)).toBe(false);
  } finally {
    registration();
    add.mockRestore();
    remove.mockRestore();
    node.remove();
  }
});
test("direct/once/options registrations never expose delegated update fastpath", () => {
  const node = document.createElement("button");
  let calls = 0;
  const object = {
    capture: true,
    once: true,
    handleEvent() {
      calls++;
    },
  };
  const stop = registerSolidEvent(node, "onClick", object);
  expect(stop.update).toBeUndefined();
  node.click();
  node.click();
  expect(calls).toBe(1);
  object.capture = false;
  stop();
  node.click();
  expect(calls).toBe(1);
  const direct = registerSolidEvent(node, "on:click", () => calls++);
  expect(direct.update).toBeUndefined();
  direct();
  const nullish = registerSolidEvent(node, "onClick", null);
  expect(nullish.update).toBeUndefined();
  nullish();
});
