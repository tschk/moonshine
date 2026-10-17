import { expect, test } from "bun:test";
import { setCustomElementValue } from "../src/custom-element";
import {
  createRoot,
  createSignal,
  createComputed,
  getOwner,
} from "../src/reactive";
import "../../react/test/dom";
let serial = 0;
function registered() {
  const name = `x-property-test-${serial++}`;
  let getterReads = 0;
  class Parent extends HTMLElement {
    received: unknown;
    set data(value: unknown) {
      this.received = value;
    }
    get readOnly() {
      getterReads++;
      return 1;
    }
    set fail(_value: unknown) {
      throw new Error("setter failed");
    }
  }
  class Custom extends Parent {
    plain = "initial";
  }
  customElements.define(name, Custom);
  return {
    node: document.createElement(name) as Custom,
    reads: () => getterReads,
  };
}

test("custom setters preserve literal identity while data properties and getters use attributes", () => {
  const { node, reads } = registered();
  const object = { id: 1 },
    fn = () => {
      throw new Error("not an accessor");
    };
  for (const value of [object, fn, null, undefined, false, true, 0]) {
    setCustomElementValue(node, "data", value);
    expect(node.received).toBe(value);
    setCustomElementValue(node, "plain", value);
    setCustomElementValue(node, "readOnly", value);
    expect(node.plain).toBe("initial");
    expect(node.getAttribute("readonly")).toBe(
      value == null ? null : String(value),
    );
  }
  expect(reads()).toBe(0);
  setCustomElementValue(node, "title", null);
  expect(node.title).toBe("null");
  setCustomElementValue(node, "disabled", false);
  expect(node.getAttribute("disabled")).toBe("false");
  expect(() => setCustomElementValue(node, "fail", object)).toThrow(
    "setter failed",
  );
});

test("unregistered objects retain own properties through upgrade without replaying setters", () => {
  const name = `x-late-test-${serial++}`;
  const node = document.createElement(name);
  const object = { id: 1 };
  setCustomElementValue(node, "data", object);
  const fn = () => 42;
  setCustomElementValue(node, "callback", fn);
  expect(Reflect.get(node, "data")).toBe(object);
  expect(node.getAttribute("callback")).toBe(String(fn));
  let calls = 0;
  customElements.define(
    name,
    class extends HTMLElement {
      set data(_value: unknown) {
        calls++;
      }
    },
  );
  document.body.append(node);
  expect(Reflect.get(node, "data")).toBe(object);
  expect(calls).toBe(0);
  node.remove();
});

test("custom setter execution has no owner and cannot subscribe incidental reads", () => {
  const [source, setSource] = createSignal(1),
    [incidental, setIncidental] = createSignal(0);
  const name = `x-owner-test-${serial++}`;
  let calls = 0;
  customElements.define(
    name,
    class extends HTMLElement {
      set data(_value: unknown) {
        calls++;
        expect(getOwner()).toBeNull();
        incidental();
      }
    },
  );
  const node = document.createElement(name);
  const stop = createRoot((dispose) => {
    createComputed(() => setCustomElementValue(node, "data", source()));
    return dispose;
  });
  setIncidental(1);
  expect(calls).toBe(1);
  setSource(2);
  expect(calls).toBe(2);
  stop();
});

test("custom writes validate names and keep event, HTML-content and prototype boundaries", () => {
  const node = document.createElement(`x-safe-test-${serial++}`);
  const prototype = Object.getPrototypeOf(node);
  const value = { toString: () => "<b>literal</b>" };
  for (const name of [
    "innerHTML",
    "outerHTML",
    "textContent",
    "innerText",
    "__proto__",
    "style",
  ]) {
    setCustomElementValue(node, name, value);
    expect(node.getAttribute(name)).toBe("<b>literal</b>");
  }
  expect(node.innerHTML).toBe("");
  expect(Object.getPrototypeOf(node)).toBe(prototype);
  for (const name of ["onclick", "on:Ping", "OnCustom"])
    expect(() => setCustomElementValue(node, name, () => {})).toThrow(
      "event listeners",
    );
  expect(() => setCustomElementValue(node, "bad name", 1)).toThrow();
  expect(() =>
    setCustomElementValue(document.createElement("div"), "data", 1),
  ).toThrow("hyphenated HTML");
  expect(() =>
    setCustomElementValue(
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "x-svg",
      ) as unknown as HTMLElement,
      "data",
      1,
    ),
  ).toThrow("hyphenated HTML");
});

test("registered property and fallback values match installed Svelte helper", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const { set_custom_element_data: reference } = await import(
    new URL("./src/internal/client/index.js", `file://${pkg}`).pathname
  );
  const actual = registered(),
    expected = registered();
  for (const value of [{ id: 1 }, () => 42, null, undefined, false, true, 0]) {
    for (const key of ["data", "plain", "readOnly", "title", "disabled"]) {
      setCustomElementValue(actual.node, key, value);
      reference(expected.node, key, value);
    }
    expect(actual.node.received).toBe(expected.node.received);
    expect(actual.node.plain).toBe(expected.node.plain);
    expect(
      actual.node
        .getAttributeNames()
        .map((name) => [name, actual.node.getAttribute(name)]),
    ).toEqual(
      expected.node
        .getAttributeNames()
        .map((name) => [name, expected.node.getAttribute(name)]),
    );
  }
  expect([actual.reads(), expected.reads()]).toEqual([0, 0]);
});
