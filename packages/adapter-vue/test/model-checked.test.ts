import { expect, test } from "bun:test";
import { createRoot, createSignal } from "@tschk/moonshine-dom/reactive";
import { bindCheckedModel, createCheckedModel } from "../src/model";
import { ref } from "../src/reactive";
import "../../react/test/dom";

type Props = Record<string, unknown>;

function input(type: "checkbox" | "radio", checked?: boolean) {
  const element = document.createElement("input");
  element.type = type;
  if (checked !== undefined) element.checked = checked;
  document.body.append(element);
  return element;
}

function mount(
  type: "checkbox" | "radio",
  initial: unknown,
  props: Props = {},
  checked?: boolean,
) {
  const element = input(type, checked);
  if (props.value != null) element.value = String(props.value);
  const [read, set] = createSignal(initial);
  let writes = 0;
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    bindCheckedModel(
      element,
      read,
      (value) => {
        writes++;
        set(() => value);
      },
      props,
    );
  });
  return {
    element,
    read,
    set: (value: unknown) => set(() => value),
    writes: () => writes,
    toggle: (next: boolean) => {
      element.checked = next;
      element.dispatchEvent(new Event("change"));
    },
    stop: () => {
      stop();
      element.remove();
    },
  };
}

test("calibration: undefined checkbox retains explicit checked, null clears it", () => {
  const kept = mount("checkbox", undefined, {}, true);
  expect(kept.element.checked).toBe(true);
  expect(kept.element.value).toBe("on");
  expect(kept.writes()).toBe(0);
  kept.stop();
  const cleared = mount("checkbox", null, {}, true);
  expect(cleared.element.checked).toBe(false);
  expect(cleared.writes()).toBe(0);
  cleared.stop();
});

test("calibration: radio with omitted value matches an undefined model", () => {
  const f = mount("radio", undefined);
  expect(f.element.checked).toBe(true);
  expect(f.element.value).toBe("on");
  expect(f.writes()).toBe(0);
  f.stop();
});

test("calibration: radio with explicit undefined value writes undefined", () => {
  const f = mount("radio", null, { value: undefined });
  expect(f.element.checked).toBe(false);
  f.toggle(true);
  expect(f.writes()).toBe(1);
  expect(f.read()).toBeUndefined();
  expect(f.element.checked).toBe(true);
  f.stop();
});

test("calibration: array membership is loose and removal writes the remainder", () => {
  const f = mount("checkbox", [1], { value: "1" });
  expect(f.element.checked).toBe(true);
  f.toggle(false);
  expect(f.writes()).toBe(1);
  expect(f.read()).toEqual([]);
  expect(f.element.checked).toBe(false);
  f.stop();
});

test("calibration: Set membership is strict identity", () => {
  const f = mount("checkbox", new Set([1]), { value: "1" });
  expect(f.element.checked).toBe(false);
  f.toggle(true);
  expect(f.writes()).toBe(1);
  expect([...(f.read() as Set<unknown>)]).toEqual([1, "1"]);
  expect(f.element.checked).toBe(true);
  f.stop();
});

test("calibration: array appends in interaction order", () => {
  const f = mount("checkbox", ["b"], { value: "a" });
  expect(f.element.checked).toBe(false);
  f.toggle(true);
  expect(f.writes()).toBe(1);
  expect(f.read()).toEqual(["b", "a"]);
  expect(f.element.checked).toBe(true);
  f.stop();
});

test("calibration: scalar models use typed true/false values", () => {
  const f = mount("checkbox", "yes", {
    "true-value": "yes",
    "false-value": "no",
  });
  expect(f.element.checked).toBe(true);
  f.toggle(false);
  expect(f.writes()).toBe(1);
  expect(f.read()).toBe("no");
  expect(f.element.checked).toBe(false);
  f.toggle(true);
  expect(f.read()).toBe("yes");
  f.stop();
});

test("calibration: radio matches loosely equal objects without writing", () => {
  const f = mount("radio", { id: 1 }, { value: { id: 1 } });
  expect(f.element.checked).toBe(true);
  expect(f.element.value).toBe("[object Object]");
  expect(f.writes()).toBe(0);
  f.stop();
});

test("array clicks append in click order across sharing checkboxes", () => {
  const [read, set] = createSignal<unknown[]>([]);
  const boxes = ["a", "b", "c"].map((value) => ({
    value,
    element: input("checkbox"),
  }));
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    for (const { element, value } of boxes)
      bindCheckedModel(element, read, (next) => set(() => next as unknown[]), {
        value,
      });
  });
  for (const i of [2, 0, 1]) {
    boxes[i]!.element.checked = true;
    boxes[i]!.element.dispatchEvent(new Event("change"));
  }
  expect(read()).toEqual(["c", "a", "b"]);
  stop();
  for (const { element } of boxes) element.remove();
});

test("array removal drops only the first loose match; unchanged states do not write", () => {
  const f = mount("checkbox", ["1", 1, "1"], { value: 1 });
  f.toggle(false);
  expect(f.read()).toEqual([1, "1"]);
  expect(f.writes()).toBe(1);
  f.toggle(true);
  expect(f.writes()).toBe(1);
  f.stop();
  const g = mount("checkbox", ["x"], { value: "y" });
  g.toggle(false);
  expect(g.writes()).toBe(0);
  expect(g.read()).toEqual(["x"]);
  g.stop();
});

test("programmatic native ref Set mutation updates checked", () => {
  const model = ref(new Set<string>());
  const element = input("checkbox");
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    bindCheckedModel(
      element,
      () => model.value,
      () => {},
      { value: "x" },
    );
  });
  expect(element.checked).toBe(false);
  model.value.add("x");
  expect(element.checked).toBe(true);
  model.value.delete("x");
  expect(element.checked).toBe(false);
  stop();
  model.value.add("x");
  expect(element.checked).toBe(false);
  element.remove();
});

test("typed true/false getters stay live and keep their JavaScript types", () => {
  const [on, setOn] = createSignal<unknown>(1);
  const f = mount("checkbox", 0, {
    get "true-value"() {
      return on();
    },
    "false-value": 0,
  });
  expect(f.element.checked).toBe(false);
  f.toggle(true);
  expect(f.read()).toBe(1);
  setOn(7);
  f.toggle(false);
  f.toggle(true);
  expect(f.read()).toBe(7);
  f.toggle(false);
  expect(f.read()).toBe(0);
  f.stop();
});

test("a rejected setter leaves the user's DOM state until the model actually updates", () => {
  const [read, set] = createSignal<string[]>(["a"]);
  const element = input("checkbox");
  let writes = 0;
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    bindCheckedModel(element, read, () => void writes++, { value: "a" });
  });
  expect(element.checked).toBe(true);
  element.checked = false;
  element.dispatchEvent(new Event("change"));
  expect(writes).toBe(1);
  expect(read()).toEqual(["a"]);
  expect(element.checked).toBe(false);
  set(["a", "z"]);
  expect(element.checked).toBe(true);
  stop();
  element.remove();
});

test("disposal removes the listener and render effect; roots are independent", () => {
  const a = mount("checkbox", [] as string[], { value: "a" });
  const b = mount("checkbox", [] as string[], { value: "b" });
  a.stop();
  a.element.checked = true;
  a.element.dispatchEvent(new Event("change"));
  expect(a.writes()).toBe(0);
  a.set(["a"]);
  a.element.checked = false;
  a.set(["a", "q"]);
  expect(a.element.checked).toBe(false);
  b.toggle(true);
  expect(b.read()).toEqual(["b"]);
  expect(b.writes()).toBe(1);
  b.stop();
});

test("factory publishes the model before the user's change handler", () => {
  const [read, set] = createSignal<unknown>(false);
  let seen: unknown = "unset";
  let stop!: () => void;
  let element!: HTMLInputElement;
  createRoot((dispose) => {
    stop = dispose;
    element = createCheckedModel(
      "checkbox",
      {
        onChange: () => {
          seen = read();
        },
      },
      read,
      (value) => set(() => value),
    );
  });
  expect(element.type).toBe("checkbox");
  element.checked = true;
  element.dispatchEvent(new Event("change"));
  expect(seen).toBe(true);
  stop();
});

test("validation requires a live owner, a checkbox/radio input and functions", () => {
  const element = input("checkbox");
  expect(() =>
    bindCheckedModel(
      element,
      () => 0,
      () => {},
    ),
  ).toThrow("live native owner");
  createRoot((stop) => {
    const text = document.createElement("input");
    expect(() =>
      bindCheckedModel(
        text,
        () => 0,
        () => {},
      ),
    ).toThrow("checkbox or radio");
    expect(() =>
      bindCheckedModel(
        document.createElement("div") as HTMLInputElement,
        () => 0,
        () => {},
      ),
    ).toThrow("checkbox or radio");
    expect(() =>
      bindCheckedModel(element, 1 as unknown as () => unknown, () => {}),
    ).toThrow("getter/setter");
    expect(() =>
      bindCheckedModel(element, () => 0, null as unknown as () => void),
    ).toThrow("getter/setter");
    stop();
  });
  element.remove();
});

test("factory applies checked policy after attributes and preserves typed radio values", () => {
  for (const [type, initial, props, checked, value] of [
    ["checkbox", undefined, { checked: true }, true, "on"],
    ["checkbox", null, { checked: true }, false, "on"],
    ["radio", undefined, {}, true, "on"],
    ["radio", null, { value: undefined }, false, "on"],
    ["radio", { id: 1 }, { value: { id: "1" } }, true, "[object Object]"],
  ] as const) {
    createRoot((dispose) => {
      const element = createCheckedModel(
        type,
        props,
        () => initial,
        () => {},
      );
      expect(element.checked).toBe(checked);
      expect(element.value).toBe(value);
      dispose();
    });
  }
});

test("omitted values write the DOM default while explicit undefined stays typed", () => {
  const radio = mount("radio", null);
  radio.toggle(true);
  expect(radio.read()).toBe("on");
  expect(radio.element.checked).toBe(false);
  radio.stop();
  const checkbox = mount("checkbox", []);
  checkbox.toggle(true);
  expect(checkbox.read()).toEqual(["on"]);
  expect(checkbox.element.checked).toBe(false);
  checkbox.stop();
});
