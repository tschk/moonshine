import { afterEach, expect, test } from "bun:test";
import {
  bindChecked,
  bindValue,
  bindSelectValue,
  createInputGroup,
  setInputValue,
  setOptionValue,
  type InputValue,
} from "../src/binding";
import { h, render } from "../src/dom";
import { createRoot, createSignal } from "../src/reactive";
import "../../react/test/dom";
const disposers: Array<() => void> = [];
afterEach(() => {
  for (const stop of disposers.splice(0)) stop();
  document.body.replaceChildren();
});
function setup(
  initial: InputValue,
  props: Record<string, unknown> = {},
  tag = "input",
) {
  const [read, write] = createSignal<InputValue>(initial);
  const container = document.createElement("div");
  document.body.append(container);
  let element!: HTMLInputElement | HTMLTextAreaElement;
  disposers.push(
    render(() => {
      element = h(tag, props) as typeof element;
      bindValue(element, read, write);
      return element;
    }, container),
  );
  return { element, read, write };
}
test("input listeners run before binding, parent writes update DOM without replacing focused input", () => {
  const events: string[] = [];
  const { element, read, write } = setup("initial", {
    onInput: () => events.push("user"),
  });
  element.focus();
  element.value = "typed";
  element.setSelectionRange(2, 2);
  element.addEventListener("input", () => events.push(String(read())));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  expect(events).toEqual(["user", "typed"]);
  expect(read()).toBe("typed");
  expect(element.selectionStart).toBe(2);
  expect(document.activeElement).toBe(element);
  write("parent");
  expect(element.value).toBe("parent");
});
test("undefined/null adopt existing defaults while explicit values win, including textarea", () => {
  for (const initial of [undefined, null]) {
    const { element, read } = setup(initial, { defaultValue: "default" });
    expect(element.value).toBe("default");
    expect(read()).toBe("default");
  }
  const explicit = setup("state", { defaultValue: "default" });
  expect(explicit.element.value).toBe("state");
  expect(explicit.element.defaultValue).toBe("default");
  const textarea = setup(undefined, { defaultValue: "multiline" }, "textarea");
  expect(textarea.read()).toBe("multiline");
});
test("number/range coerce input and empty number becomes undefined while equal formatting is retained", () => {
  const numeric = setup(1, { type: "number" });
  numeric.element.value = "02";
  numeric.element.dispatchEvent(new Event("input"));
  expect(numeric.read()).toBe(2);
  expect(numeric.element.value).toBe("02");
  numeric.element.value = "";
  numeric.element.dispatchEvent(new Event("input"));
  expect(numeric.read()).toBeUndefined();
  numeric.write(4);
  expect(numeric.element.value).toBe("4");
  const range = setup(10, { type: "range" });
  range.element.value = "20";
  range.element.dispatchEvent(new Event("input"));
  expect(range.read()).toBe(20);
});
test("reset synchronizes defaults for normal and external controls, respects cancellation and disposal", async () => {
  const form = document.createElement("form");
  form.id = "external";
  document.body.append(form);
  const { element, read, write } = setup("state", {
    defaultValue: "baseline",
    form: "external",
  });
  write("typed");
  form.reset();
  await Promise.resolve();
  expect(element.value).toBe("baseline");
  expect(read()).toBe("baseline");
  write("keep");
  form.addEventListener("reset", (event) => event.preventDefault(), {
    once: true,
  });
  // Happy DOM resets despite preventDefault; exercise the cancelled event here.
  // The real form.reset cancellation path is also checked in Chromium.
  form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
  await Promise.resolve();
  expect(read()).toBe("keep");
  expect(element.value).toBe("keep");
  form.reset();
  for (const stop of disposers.splice(0)) stop();
  await Promise.resolve();
  expect(read()).toBe("keep");
  element.value = "detached";
  element.dispatchEvent(new Event("input"));
  expect(read()).toBe("keep");
});
test("ordinary nested form reset and textarea defaults synchronize after native reset", async () => {
  const form = document.createElement("form");
  document.body.append(form);
  const { element, read } = setup(
    undefined,
    { defaultValue: "initial" },
    "textarea",
  );
  form.append(element);
  element.value = "typed";
  element.dispatchEvent(new Event("input"));
  expect(read()).toBe("typed");
  form.reset();
  await Promise.resolve();
  expect(read()).toBe("initial");
});
test("unsupported controls and ownerless setup fail explicitly", () => {
  expect(() =>
    bindValue(
      document.createElement("input"),
      () => "",
      () => {},
    ),
  ).toThrow("live native owner");
  createRoot((stop) => {
    disposers.push(stop);
    for (const type of ["checkbox", "radio", "file", "button"]) {
      const input = document.createElement("input");
      input.type = type;
      expect(() =>
        bindValue(
          input,
          () => "",
          () => {},
        ),
      ).toThrow("support text, numeric");
    }
  });
});

test("reset follows reassociation between connected forms even when propagation is stopped", async () => {
  const first = document.createElement("form"),
    second = document.createElement("form");
  first.id = "first";
  second.id = "second";
  document.body.append(first, second);
  const { element, read } = setup("state", {
    form: "first",
    defaultValue: "baseline",
  });
  element.setAttribute("form", "second");
  first.reset();
  await Promise.resolve();
  expect(read()).toBe("state");
  second.addEventListener("reset", (event) => event.stopPropagation());
  second.reset();
  await Promise.resolve();
  expect(read()).toBe("baseline");
});

test("setter validation is reflected immediately even when it rejects an unchanged numeric state", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const [read, write] = createSignal<InputValue>(2);
  let input!: HTMLInputElement;
  disposers.push(
    render(() => {
      input = h("input", { type: "number" }) as HTMLInputElement;
      bindValue(input, read, (value) =>
        write(typeof value === "number" ? Math.min(value, 2) : value),
      );
      return input;
    }, container),
  );
  input.value = "9";
  input.dispatchEvent(new Event("input"));
  expect(read()).toBe(2);
  expect(input.value).toBe("2");
});

function checkbox(initial: boolean | null | undefined, defaultChecked = false) {
  const [read, write] = createSignal<boolean | null | undefined>(initial);
  const container = document.createElement("div");
  document.body.append(container);
  let input!: HTMLInputElement;
  const events: Array<boolean | null | undefined> = [];
  const stop = render(() => {
    input = h("input", {
      type: "checkbox",
      defaultChecked,
      onChange: () => events.push(read()),
    }) as HTMLInputElement;
    bindChecked(input, read, write);
    return input;
  }, container);
  disposers.push(stop);
  return { input, read, write, stop, events };
}
test("checkbox defaults initialize nullish state even when false, explicit checked wins", () => {
  for (const initial of [undefined, null])
    for (const fallback of [true, false]) {
      const binding = checkbox(initial, fallback);
      expect(binding.read()).toBe(fallback);
      expect(binding.input.checked).toBe(fallback);
    }
  const explicit = checkbox(false, true);
  expect(explicit.input.checked).toBe(false);
  expect(explicit.input.defaultChecked).toBe(true);
});
test("checkbox uses change after user handlers and parent writes remain reactive", () => {
  const binding = checkbox(false);
  binding.input.checked = true;
  binding.input.dispatchEvent(new Event("input"));
  expect(binding.read()).toBe(false);
  binding.input.dispatchEvent(new Event("change"));
  expect(binding.events).toEqual([false]);
  expect(binding.read()).toBe(true);
  binding.write(false);
  expect(binding.input.checked).toBe(false);
});
test("checkbox reset follows defaultChecked, cancellation, external reassociation and queued disposal", async () => {
  const first = document.createElement("form"),
    second = document.createElement("form");
  first.id = "checks-first";
  second.id = "checks-second";
  document.body.append(first, second);
  const binding = checkbox(false, true);
  binding.input.setAttribute("form", first.id);
  first.addEventListener("reset", (event) => event.stopPropagation());
  first.reset();
  await Promise.resolve();
  expect(binding.read()).toBe(true);
  binding.write(false);
  binding.input.setAttribute("form", second.id);
  first.reset();
  await Promise.resolve();
  expect(binding.read()).toBe(false);
  second.addEventListener("reset", (event) => event.preventDefault(), {
    once: true,
  });
  second.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
  await Promise.resolve();
  expect(binding.read()).toBe(false);
  second.reset();
  binding.stop();
  await Promise.resolve();
  expect(binding.read()).toBe(false);
  binding.input.checked = true;
  binding.input.dispatchEvent(new Event("change"));
  expect(binding.read()).toBe(false);
});
test("checked binding rejects radio and ownerless calls", () => {
  expect(() =>
    bindChecked(
      document.createElement("input"),
      () => false,
      () => {},
    ),
  ).toThrow("live native owner");
  createRoot((stop) => {
    disposers.push(stop);
    const input = document.createElement("input");
    input.type = "radio";
    expect(() =>
      bindChecked(
        input,
        () => false,
        () => {},
      ),
    ).toThrow("checkbox inputs only");
  });
});

function selectBinding(
  initial: unknown,
  multiple = false,
  options?: HTMLOptionElement[],
) {
  const [read, write] = createSignal<unknown>(initial);
  const container = document.createElement("div");
  document.body.append(container);
  let select!: HTMLSelectElement;
  const events: unknown[] = [];
  const stop = render(() => {
    select = h(
      "select",
      { multiple, onChange: () => events.push(read()) },
      options ?? [
        h("option", { value: "a" }, "A"),
        h("option", { value: "b", selected: true }, "B"),
      ],
    ) as HTMLSelectElement;
    bindSelectValue(select, read, write);
    return select;
  }, container);
  disposers.push(stop);
  return { select, read, write, stop, events };
}
test("single select adopts undefined defaults, explicit null deselects, changes follow user listeners", () => {
  const initial = selectBinding(undefined);
  expect(initial.read()).toBe("b");
  const binding = selectBinding("a");
  expect(binding.select.value).toBe("a");
  binding.select.value = "b";
  binding.select.dispatchEvent(new Event("change"));
  expect(binding.events).toEqual(["a"]);
  expect(binding.read()).toBe("b");
  binding.write(null);
  expect(binding.select.selectedIndex).toBe(-1);
  binding.write("missing");
  expect(binding.select.selectedIndex).toBe(-1);
});
test("option hook preserves typed primitive and object identity and refreshes equal string representations", () => {
  const first = { id: 1 },
    second = { id: 2 };
  const a = document.createElement("option"),
    b = document.createElement("option");
  setOptionValue(a, first);
  setOptionValue(b, second);
  const binding = selectBinding(first, false, [a, b]);
  expect(a.selected).toBe(true);
  binding.select.selectedIndex = 1;
  binding.select.dispatchEvent(new Event("change"));
  expect(binding.read()).toBe(second);
  setOptionValue(a, second);
  setOptionValue(b, first);
  expect(binding.select.selectedIndex).toBe(0);
  const number = document.createElement("option"),
    text = document.createElement("option");
  setOptionValue(number, 1);
  setOptionValue(text, "1");
  const primitive = selectBinding(1, false, [number, text]);
  expect(primitive.select.selectedIndex).toBe(0);
  primitive.write("1");
  expect(primitive.select.selectedIndex).toBe(1);
});
// Intentional: Svelte 5.46.4/5.57.1 initialize undefined multiple state to a scalar;
// this native contract consistently uses arrays for multiple values.
test("multiple select preserves typed arrays and undefined adopts all selected defaults", () => {
  const a = document.createElement("option"),
    b = document.createElement("option");
  const object = { id: 1 };
  setOptionValue(a, object);
  setOptionValue(b, 2);
  a.defaultSelected = true;
  b.defaultSelected = true;
  a.selected = true;
  b.selected = true;
  const binding = selectBinding(undefined, true, [a, b]);
  expect(binding.read()).toEqual([object, 2]);
  binding.write([2]);
  expect(a.selected).toBe(false);
  expect(b.selected).toBe(true);
  a.selected = true;
  binding.select.dispatchEvent(new Event("change"));
  expect(binding.read()).toEqual([object, 2]);
  binding.write([]);
  expect(
    Array.from(binding.select.options).some((option) => option.selected),
  ).toBe(false);
  expect(() => binding.write("invalid")).toThrow("require an array");
});
test("option insertion, removal, text and attributes reapply model without replacing it", async () => {
  const binding = selectBinding("later");
  const option = document.createElement("option");
  option.textContent = "later";
  binding.select.append(option);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(option.selected).toBe(true);
  expect(binding.read()).toBe("later");
  option.textContent = "changed";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(binding.select.selectedIndex).toBe(-1);
  expect(binding.read()).toBe("later");
  option.value = "later";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(option.selected).toBe(true);
  option.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(binding.select.selectedIndex).toBe(-1);
  expect(binding.read()).toBe("later");
});
test("select reset follows defaults, external form, cancellation and queued disposal", async () => {
  const form = document.createElement("form");
  form.id = "select-form";
  document.body.append(form);
  const binding = selectBinding("a");
  binding.select.setAttribute("form", form.id);
  form.addEventListener("reset", (event) => event.stopPropagation());
  form.reset();
  await Promise.resolve();
  expect(binding.read()).toBe("b");
  binding.write("a");
  form.addEventListener("reset", (event) => event.preventDefault(), {
    once: true,
  });
  form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
  await Promise.resolve();
  expect(binding.read()).toBe("a");
  form.reset();
  binding.stop();
  await Promise.resolve();
  expect(binding.read()).toBe("a");
  binding.select.value = "b";
  binding.select.dispatchEvent(new Event("change"));
  expect(binding.read()).toBe("a");
});

test("selected attribute mutations preserve the model and disposal removes option refresh work", async () => {
  const binding = selectBinding("b");
  const first = binding.select.options[0]!;
  first.setAttribute("selected", "");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(binding.select.value).toBe("b");
  expect(binding.read()).toBe("b");
  binding.stop();
  const select = document.createElement("select");
  const option = document.createElement("option");
  option.value = "b";
  select.append(option);
  document.body.append(select);
  let reads = 0;
  createRoot((stop) => {
    bindSelectValue(
      select,
      () => {
        reads++;
        return "b";
      },
      () => {},
    );
    stop();
  });
  const count = reads;
  setOptionValue(option, { id: "detached" });
  option.textContent = "changed";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reads).toBe(count);
  expect(binding.read()).toBe("b");
});

test("single select can preserve an explicit typed null option value", () => {
  const option = document.createElement("option");
  setOptionValue(option, null);
  const binding = selectBinding(null, false, [option]);
  expect(binding.select.selectedIndex).toBe(0);
  binding.select.dispatchEvent(new Event("change"));
  expect(binding.read()).toBeNull();
});

test("empty multiple adopts an empty array while an empty single retains undefined", () => {
  expect(selectBinding(undefined, true, []).read()).toEqual([]);
  expect(selectBinding(undefined, false, []).read()).toBeUndefined();
  const option = document.createElement("option");
  option.value = "unselected";
  const multiple = selectBinding(undefined, true, [option]);
  expect(multiple.read()).toEqual([]);
});
test("single change without a selected option falls back to the first enabled option", () => {
  const disabled = document.createElement("option"),
    enabled = document.createElement("option");
  disabled.disabled = true;
  disabled.value = "disabled";
  enabled.value = "enabled";
  const binding = selectBinding("missing", false, [disabled, enabled]);
  binding.select.selectedIndex = -1;
  binding.select.dispatchEvent(new Event("change"));
  expect(binding.read()).toBe("enabled");
});

test("multiple reset restores typed selected defaults as an array", async () => {
  const form = document.createElement("form");
  form.id = "multiple-reset";
  document.body.append(form);
  const a = document.createElement("option"),
    b = document.createElement("option"),
    object = { id: 1 };
  a.setAttribute("selected", "");
  a.selected = true;
  setOptionValue(a, object);
  setOptionValue(b, 2);
  const binding = selectBinding([2], true, [a, b]);
  binding.select.setAttribute("form", form.id);
  form.reset();
  await Promise.resolve();
  expect(binding.read()).toEqual([object]);
});

function inputGroup(
  kind: "radio" | "checkbox",
  initial: unknown,
  values: unknown[],
  defaultChecked = false,
) {
  const [read, write] = createSignal<unknown>(initial);
  const inputs: HTMLInputElement[] = [];
  let group!: ReturnType<typeof createInputGroup>;
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    disposers.push(dispose);
    group = createInputGroup(kind, read, write);
    for (const value of values) {
      const input = document.createElement("input");
      input.type = kind;
      input.defaultChecked = defaultChecked;
      input.checked = defaultChecked;
      setInputValue(input, value);
      document.body.append(input);
      group.bind(input);
      inputs.push(input);
    }
  });
  return { group, read, write, inputs, stop };
}
test("radio groups preserve typed identity, undefined/null values and parent updates", () => {
  const object = { id: 1 };
  const binding = inputGroup("radio", undefined, [
    undefined,
    null,
    1,
    "1",
    object,
  ]);
  expect(binding.inputs.map((input) => input.checked)).toEqual([
    true,
    false,
    false,
    false,
    false,
  ]);
  binding.write(object);
  expect(binding.inputs[4]!.checked).toBe(true);
  binding.inputs[1]!.checked = true;
  binding.inputs[1]!.dispatchEvent(new Event("change"));
  expect(binding.read()).toBeNull();
  expect(binding.inputs[0]!.checked).toBe(false);
  setInputValue(binding.inputs[4]!, null);
  expect(binding.inputs[4]!.checked).toBe(true);
});
test("checkbox groups collect DOM order, deduplicate and unchecking duplicates removes the value", () => {
  const object = { id: 1 };
  const binding = inputGroup("checkbox", [], [object, 2, object]);
  document.body.prepend(binding.inputs[1]!);
  for (const input of binding.inputs) input.checked = true;
  binding.inputs[0]!.dispatchEvent(new Event("change"));
  expect(binding.read()).toEqual([2, object]);
  binding.inputs[2]!.checked = false;
  binding.inputs[2]!.dispatchEvent(new Event("change"));
  expect(binding.read()).toEqual([2]);
  expect(binding.inputs[0]!.checked).toBe(false);
  binding.write([object]);
  setInputValue(binding.inputs[0]!, { id: 2 });
  expect(binding.inputs[0]!.checked).toBe(false);
});
test("group tokens isolate siblings and owner disposal unregisters live detached row members", () => {
  const first = inputGroup("checkbox", [], [1]),
    second = inputGroup("checkbox", [], [1]);
  first.inputs[0]!.checked = true;
  first.inputs[0]!.dispatchEvent(new Event("change"));
  expect(first.read()).toEqual([1]);
  expect(second.read()).toEqual([]);
  let stopRow!: () => void;
  let row!: HTMLInputElement;
  createRoot((stop) => {
    stopRow = stop;
    disposers.push(stop);
    row = document.createElement("input");
    row.type = "checkbox";
    setInputValue(row, 2);
    document.body.append(row);
    first.group.bind(row);
  });
  first.write([1, 2]);
  expect(row.checked).toBe(true);
  stopRow();
  row.checked = true;
  row.dispatchEvent(new Event("change"));
  first.inputs[0]!.dispatchEvent(new Event("change"));
  expect(first.read()).toEqual([1]);
  first.stop();
  first.inputs[0]!.checked = false;
  first.inputs[0]!.dispatchEvent(new Event("change"));
  expect(first.read()).toEqual([1]);
  createRoot((stop) => {
    expect(() => first.group.bind(row)).toThrow("live group");
    stop();
  });
});
test("group change follows user listeners, undefined ignores defaults and reset clears values", async () => {
  for (const kind of ["checkbox", "radio"] as const) {
    const form = document.createElement("form");
    form.id = "group-" + kind;
    document.body.append(form);
    const binding = inputGroup(kind, undefined, ["a", "b"]);
    for (const input of binding.inputs) {
      input.setAttribute("form", form.id);
      input.defaultChecked = true;
    }
    binding.write(kind === "checkbox" ? [] : null);
    expect(binding.inputs.every((input) => !input.checked)).toBe(true);
    binding.write(kind === "checkbox" ? ["a"] : "a");
    form.addEventListener("reset", (event) => event.stopPropagation());
    form.reset();
    await Promise.resolve();
    expect(binding.read()).toEqual(kind === "checkbox" ? [] : null);
    binding.write(kind === "checkbox" ? ["a"] : "a");
    form.addEventListener("reset", (event) => event.preventDefault(), {
      once: true,
    });
    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(binding.read()).toEqual(kind === "checkbox" ? ["a"] : "a");
    form.reset();
    binding.stop();
    await Promise.resolve();
    expect(binding.read()).toEqual(kind === "checkbox" ? ["a"] : "a");
  }
});
test("group member registration preserves preinstalled change order and validates kind", () => {
  const [read, write] = createSignal<unknown>([]);
  const seen: unknown[] = [];
  createRoot((stop) => {
    disposers.push(stop);
    const group = createInputGroup("checkbox", read, write);
    const input = document.createElement("input");
    input.type = "checkbox";
    setInputValue(input, "a");
    input.addEventListener("change", () => seen.push(read()));
    group.bind(input);
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(seen).toEqual([[]]);
    expect(read()).toEqual(["a"]);
    expect(() => group.bind(input)).toThrow("already belongs");
    const radio = document.createElement("input");
    radio.type = "radio";
    expect(() => group.bind(radio)).toThrow("checkbox inputs");
  });
  expect(() =>
    createInputGroup(
      "radio",
      () => null,
      () => {},
    ),
  ).toThrow("live native owner");
});

test("undefined group models do not adopt preinstalled checked defaults", () => {
  for (const kind of ["radio", "checkbox"] as const) {
    const binding = inputGroup(kind, undefined, ["a", "b"], true);
    expect(binding.read()).toBeUndefined();
    expect(binding.inputs.every((input) => !input.checked)).toBe(true);
  }
});

test("radio Object.is and checkbox inclusion retain NaN and signed-zero rules", () => {
  const radio = inputGroup("radio", -0, [-0, 0, NaN]);
  expect(radio.inputs.map((input) => input.checked)).toEqual([
    true,
    false,
    false,
  ]);
  radio.write(NaN);
  expect(radio.inputs.map((input) => input.checked)).toEqual([
    false,
    false,
    true,
  ]);
  const checks = inputGroup("checkbox", [NaN, -0], [NaN, NaN, 0]);
  expect(checks.inputs.every((input) => input.checked)).toBe(true);
  checks.inputs[0]!.dispatchEvent(new Event("change"));
  expect(checks.read()).toEqual([NaN, 0]);
});

test("single select comparator matches opaque identities but change writes the original option", () => {
  const raw = Object.freeze({ id: 1 }),
    alias = Object.freeze({ id: 1 }),
    other = Object.freeze({ id: 2 });
  const first = document.createElement("option"),
    second = document.createElement("option");
  setOptionValue(first, raw);
  setOptionValue(second, other);
  const [read, write] = createSignal<unknown>(alias);
  const payloads: unknown[] = [];
  const equal = (left: unknown, right: unknown) =>
    (left as { id: number })?.id === (right as { id: number })?.id;
  createRoot((stop) => {
    disposers.push(stop);
    const select = document.createElement("select");
    select.append(first, second);
    document.body.append(select);
    bindSelectValue(
      select,
      read,
      (value) => {
        payloads.push(value);
        write(value);
      },
      equal,
    );
    expect(select.selectedIndex).toBe(0);
    select.selectedIndex = 1;
    select.dispatchEvent(new Event("change"));
    expect(payloads[0]).toBe(other);
    expect(read()).toBe(other);
    write(alias);
    expect(select.selectedIndex).toBe(0);
  });
  const plain = document.createElement("option");
  setOptionValue(plain, raw);
  const unmatched = document.createElement("option");
  setOptionValue(unmatched, other);
  createRoot((stop) => {
    disposers.push(stop);
    const select = document.createElement("select");
    select.append(plain, unmatched);
    document.body.append(select);
    bindSelectValue(
      select,
      () => alias,
      () => {},
    );
    expect(select.selectedIndex).toBe(-1);
  });
});
test("radio comparator matches aliases without changing clicked payload identity or default equality", () => {
  const raw = Object.freeze({ id: 1 }),
    alias = Object.freeze({ id: 1 }),
    other = Object.freeze({ id: 2 });
  const [read, write] = createSignal<unknown>(alias);
  const payloads: unknown[] = [];
  createRoot((stop) => {
    disposers.push(stop);
    const group = createInputGroup(
      "radio",
      read,
      (value) => {
        payloads.push(value);
        write(value);
      },
      (left, right) =>
        (left as { id: number })?.id === (right as { id: number })?.id,
    );
    const inputs = [raw, other].map((value) => {
      const input = document.createElement("input");
      input.type = "radio";
      setInputValue(input, value);
      document.body.append(input);
      group.bind(input);
      return input;
    });
    expect(inputs.map((input) => input.checked)).toEqual([true, false]);
    inputs[1]!.checked = true;
    inputs[1]!.dispatchEvent(new Event("change"));
    expect(payloads[0]).toBe(other);
    expect(read()).toBe(other);
    write(alias);
    expect(inputs[0]!.checked).toBe(true);
  });
  const defaults = inputGroup("radio", alias, [raw, alias]);
  expect(defaults.inputs.map((input) => input.checked)).toEqual([false, true]);
});
test("custom comparators are never used by multiple select or checkbox groups", () => {
  const raw = { id: 1 },
    alias = { id: 1 };
  const forbidden = () => {
    throw new Error("comparator used");
  };
  createRoot((stop) => {
    disposers.push(stop);
    const select = document.createElement("select");
    select.multiple = true;
    const option = document.createElement("option");
    setOptionValue(option, raw);
    select.append(option);
    bindSelectValue(
      select,
      () => [alias],
      () => {},
      forbidden,
    );
    expect(option.selected).toBe(false);
    const group = createInputGroup(
      "checkbox",
      () => [alias],
      () => {},
      forbidden,
    );
    const input = document.createElement("input");
    input.type = "checkbox";
    setInputValue(input, raw);
    group.bind(input);
    expect(input.checked).toBe(false);
  });
});

test("range reset copies raw default values before browser clamping", async () => {
  const form = document.createElement("form");
  form.id = "raw-range-reset";
  document.body.append(form);
  const empty = setup(10, { type: "range", form: form.id });
  const clamped = setup(10, {
    type: "range",
    min: 10,
    max: 20,
    defaultValue: "5",
    form: form.id,
  });
  form.reset();
  await Promise.resolve();
  expect(empty.read()).toBeUndefined();
  expect(clamped.read()).toBe(5);
  expect(empty.element.defaultValue).toBe("");
  expect(clamped.element.defaultValue).toBe("5");
  // Chromium separately verifies live values 50 and 10; Happy DOM does not fully clamp.
});
test("raw reset preserves normal text/number defaults and native empty/invalid numeric conversion", async () => {
  const form = document.createElement("form");
  form.id = "raw-value-reset";
  document.body.append(form);
  const text = setup("typed", { defaultValue: "default", form: form.id });
  const number = setup(8, { type: "number", defaultValue: "3", form: form.id });
  const empty = setup(8, { type: "number", form: form.id });
  const invalid = setup(8, {
    type: "number",
    defaultValue: "invalid",
    form: form.id,
  });
  form.reset();
  await Promise.resolve();
  expect(text.read()).toBe("default");
  expect(text.element.value).toBe("default");
  expect(number.read()).toBe(3);
  expect(number.element.value).toBe("3");
  expect(empty.read()).toBeUndefined();
  expect(invalid.read()).toBeUndefined();
});

test("value binding passes reset metadata only for reset, preserving ordinary callback arity", async () => {
  const calls: unknown[][] = [];
  const form = document.createElement("form");
  form.id = "reset-metadata";
  document.body.append(form);
  const [read, write] = createSignal<InputValue>(undefined);
  let input!: HTMLInputElement;
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(
    render(() => {
      input = h("input", {
        type: "number",
        form: form.id,
        defaultValue: "3",
      }) as HTMLInputElement;
      bindValue(
        input,
        read,
        (...args: [string | number | undefined, true?]) => {
          calls.push(args);
          write(args[0]);
        },
      );
      return input;
    }, container),
  );
  expect(calls).toEqual([[3]]);
  input.value = "4";
  input.dispatchEvent(new Event("input"));
  expect(calls.at(-1)).toEqual([4]);
  input.defaultValue = "invalid";
  form.reset();
  await Promise.resolve();
  expect(calls.at(-1)).toEqual([undefined, true]);
  expect(read()).toBeUndefined();
  input.value = "5";
  input.dispatchEvent(new Event("input"));
  expect(calls.at(-1)).toEqual([5]);
});

test("single select matches typed undefined before adopting DOM defaults", () => {
  const options = [null, undefined, ""].map((value) => {
    const option = document.createElement("option");
    setOptionValue(option, value);
    return option;
  });
  const binding = selectBinding(undefined, false, options);
  expect(binding.read()).toBeUndefined();
  expect(binding.select.selectedIndex).toBe(1);
});

test("duplicate single values preserve user choice and unchanged reset defaults", async () => {
  const form = document.createElement("form");
  form.id = "duplicate-select";
  document.body.append(form);
  const options = ["a", "a", "b"].map((value, index) => {
    const option = document.createElement("option");
    option.value = value;
    if (index === 1) option.setAttribute("selected", "");
    return option;
  });
  const binding = selectBinding("a", false, options);
  binding.select.setAttribute("form", form.id);
  expect(binding.select.selectedIndex).toBe(0);
  binding.select.selectedIndex = 1;
  binding.select.dispatchEvent(new Event("change"));
  expect(binding.read()).toBe("a");
  expect(binding.select.selectedIndex).toBe(1);
  form.reset();
  await Promise.resolve();
  expect(binding.select.selectedIndex).toBe(1);
  binding.write("b");
  form.reset();
  await Promise.resolve();
  expect(binding.read()).toBe("a");
  expect(binding.select.selectedIndex).toBe(0);
});

test("single select immediately reflects rejected or transformed writer values", () => {
  const [read, set] = createSignal<unknown>("a");
  let transform = false;
  const select = document.createElement("select");
  select.append(
    ...["a", "b", "c"].map((value) => {
      const option = document.createElement("option");
      option.value = value;
      return option;
    }),
  );
  createRoot((stop) => {
    disposers.push(stop);
    bindSelectValue(select, read, (value) => {
      if (transform) set(value === "b" ? "c" : value);
    });
  });
  select.value = "b";
  select.dispatchEvent(new Event("change"));
  expect(read()).toBe("a");
  expect(select.value).toBe("a");
  transform = true;
  select.value = "b";
  select.dispatchEvent(new Event("change"));
  expect(read()).toBe("c");
  expect(select.value).toBe("c");
});

test("date/time and color value bindings preserve string writes and stop on disposal", () => {
  const defaults: Record<string, string> = {
    date: "2026-10-16",
    "datetime-local": "2026-10-16T12:34",
    month: "2026-10",
    week: "2026-W42",
    time: "12:34",
    color: "#123456",
  };
  for (const [type, initial] of Object.entries(defaults)) {
    const input = document.createElement("input");
    input.type = type;
    input.defaultValue = initial;
    const [read, write] = createSignal<InputValue>(undefined);
    const values: unknown[] = [];
    const stop = createRoot((dispose) => {
      bindValue(input, read, (value) => {
        values.push(value);
        write(value);
      });
      return dispose;
    });
    disposers.push(stop);
    expect(read()).toBe(input.value);
    input.dispatchEvent(new Event("input"));
    expect(typeof read()).toBe("string");
    const before = read();
    stop();
    write("disposed-parent");
    expect(input.value).toBe(before);
    input.value = initial;
    input.dispatchEvent(new Event("input"));
    expect(read()).toBe("disposed-parent");
    expect(values).toHaveLength(2);
  }
});

test("date/time and color resets forward raw invalid defaults without numeric coercion", async () => {
  for (const type of [
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
    "color",
  ]) {
    const form = document.createElement("form"),
      input = document.createElement("input");
    input.type = type;
    input.defaultValue = "invalid";
    form.append(input);
    document.body.append(form);
    const [read, write] = createSignal<InputValue>("parent");
    const stop = createRoot((dispose) => {
      bindValue(input, read, write);
      return dispose;
    });
    disposers.push(stop);
    form.reset();
    await Promise.resolve();
    expect(read()).toBe("invalid");
    write("keep");
    form.reset();
    stop();
    await Promise.resolve();
    expect(read()).toBe("keep");
  }
});

test("mixed groups retain selected radio payloads when a checkbox writes membership", () => {
  const radioValue = ["a"];
  const [read, write] = createSignal<unknown>(["a"]);
  let box!: HTMLInputElement;
  let radio!: HTMLInputElement;
  createRoot((stop) => {
    disposers.push(stop);
    const group = createInputGroup("mixed", read, write);
    box = document.createElement("input");
    box.type = "checkbox";
    radio = document.createElement("input");
    radio.type = "radio";
    setInputValue(box, "a");
    setInputValue(radio, radioValue);
    document.body.append(box, radio);
    group.bind(box);
    group.bind(radio);
    expect(() => group.bind(document.createElement("input"))).toThrow(
      "radio or checkbox",
    );
  });
  expect([box.checked, radio.checked]).toEqual([true, false]);
  radio.checked = true;
  radio.dispatchEvent(new Event("change"));
  expect(read()).toBe(radioValue);
  expect([box.checked, radio.checked]).toEqual([true, true]);
  box.checked = false;
  box.dispatchEvent(new Event("change"));
  expect(read()).toEqual([radioValue]);
  expect((read() as unknown[])[0]).toBe(radioValue);
  expect([box.checked, radio.checked]).toEqual([false, false]);
});

test("setInputValue can defer group checked refresh until model or watched value updates", () => {
  const [read, write] = createSignal<unknown>(["a"]);
  const [watched, setWatched] = createSignal("a");
  let input!: HTMLInputElement;
  createRoot((stop) => {
    disposers.push(stop);
    const group = createInputGroup("checkbox", read, write);
    input = document.createElement("input");
    input.type = "checkbox";
    setInputValue(input, "a", false);
    document.body.append(input);
    expect(() => group.bind(input, "bad" as unknown as () => unknown)).toThrow(
      "watch must be a function",
    );
    group.bind(input, watched);
  });
  expect(input.checked).toBe(true);
  setInputValue(input, "b", false);
  expect(input.value).toBe("b");
  expect(input.checked).toBe(true);
  setWatched("b");
  expect(input.checked).toBe(false);
  write(["b"]);
  expect(input.checked).toBe(true);
});
