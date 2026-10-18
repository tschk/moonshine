import { expect, test } from "bun:test";
import {
  createRoot,
  createSignal,
  createRenderEffect,
} from "@tschk/moonshine-dom/reactive";
import { h } from "@tschk/moonshine-dom/dom";
import { ref } from "../src/reactive";
import { withVueScheduler } from "../src/props";
import {
  bindSelectModel,
  captureSelectScope,
  createModelOption,
  createSelectModel,
} from "../src/select";
import "../../react/test/dom";

const opt = (label: string, ...value: [] | [unknown]) =>
  createModelOption(value.length ? { value: value[0] } : {}, label);

const authored = (option: HTMLOptionElement) => {
  option.setAttribute("selected", "");
  return option;
};

const state = (select: HTMLSelectElement) => ({
  selected: Array.from(select.options).map((option) => option.selected),
  index: select.selectedIndex,
});

const choose = (select: HTMLSelectElement, ...selected: number[]) => {
  if (select.multiple)
    Array.from(select.options).forEach((option, index) => {
      option.selected = selected.includes(index);
    });
  else select.selectedIndex = selected[0] ?? -1;
  select.dispatchEvent(new Event("change"));
};

function mount(
  build: () => HTMLOptionElement[],
  initial: unknown,
  { multiple = false, number = false } = {},
) {
  const select = document.createElement("select");
  select.multiple = multiple;
  const [read, set] = createSignal(initial);
  const writes: unknown[] = [];
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    select.append(...build());
    document.body.append(select);
    bindSelectModel(
      select,
      read,
      (value) => {
        writes.push(value);
        set(() => value);
      },
      number,
    );
  });
  return {
    select,
    writes,
    read,
    set: (value: unknown) => set(() => value),
    choose: (...selected: number[]) => choose(select, ...selected),
    stop: () => {
      stop();
      select.remove();
    },
  };
}

const oneTwo = () => [opt("one", "1"), opt("two", "2")];

test("calibration: undefined clears an authored default without writing", () => {
  const m = mount(() => [authored(opt("a", "a")), opt("b", "b")], undefined);
  expect(state(m.select)).toEqual({ selected: [false, false], index: -1 });
  expect(m.writes).toEqual([]);
  m.stop();
});

test("calibration: null has no matching option", () => {
  const m = mount(oneTwo, null);
  expect(state(m.select)).toEqual({ selected: [false, false], index: -1 });
  expect(m.writes).toEqual([]);
  m.stop();
});

test("calibration: single select matches loosely equal objects without writing", () => {
  const first = { id: "1" };
  const second = { id: "2" };
  const m = mount(() => [opt("one", first), opt("two", second)], { id: 1 });
  expect(state(m.select)).toEqual({ selected: [true, false], index: 0 });
  expect(m.writes).toEqual([]);
  m.choose(1);
  expect(m.writes).toHaveLength(1);
  expect(m.writes[0]).toBe(second);
  m.stop();
});

test("calibration: single string/number match, user pick writes the string", () => {
  const m = mount(oneTwo, 1);
  expect(state(m.select)).toEqual({ selected: [true, false], index: 0 });
  expect(m.writes).toEqual([]);
  m.choose(1);
  expect(m.writes).toEqual(["2"]);
  expect(m.read()).toBe("2");
  expect(state(m.select)).toEqual({ selected: [false, true], index: 1 });
  m.stop();
});

test("calibration: number modifier parses the picked value", () => {
  const m = mount(oneTwo, "1", { number: true });
  expect(state(m.select)).toEqual({ selected: [true, false], index: 0 });
  expect(m.writes).toEqual([]);
  m.choose(1);
  expect(m.writes).toEqual([2]);
  expect(m.read()).toBe(2);
  expect(state(m.select)).toEqual({ selected: [false, true], index: 1 });
  m.stop();
});

test("calibration: multiple array membership is loose and writes selection order", () => {
  // Happy DOM reports -1 for multiple selection; Chromium covers selectedIndex.
  const m = mount(oneTwo, [1], { multiple: true });
  expect(state(m.select).selected).toEqual([true, false]);
  expect(m.writes).toEqual([]);
  m.choose(0, 1);
  expect(m.writes).toEqual([["1", "2"]]);
  expect(state(m.select).selected).toEqual([true, true]);
  m.stop();
});

test("calibration: multiple Set membership is strict and writes a Set", () => {
  const m = mount(oneTwo, new Set([1]), { multiple: true });
  expect(state(m.select)).toEqual({ selected: [false, false], index: -1 });
  expect(m.writes).toEqual([]);
  m.choose(1);
  expect(m.writes).toHaveLength(1);
  expect(m.writes[0]).toBeInstanceOf(Set);
  expect([...(m.writes[0] as Set<unknown>)]).toEqual(["2"]);
  expect(state(m.select).selected).toEqual([false, true]);
  m.stop();
});

test("calibration: deselecting everything writes undefined", () => {
  const m = mount(() => [opt("a", "a"), opt("b", "b")], "a");
  expect(state(m.select)).toEqual({ selected: [true, false], index: 0 });
  expect(m.writes).toEqual([]);
  m.choose();
  expect(m.writes).toHaveLength(1);
  expect(m.writes[0]).toBeUndefined();
  expect(state(m.select)).toEqual({ selected: [false, false], index: -1 });
  m.stop();
});

test("typed object and undefined options keep their identity", () => {
  const a = { id: 1 };
  const b = { id: 1 };
  const set = mount(
    () => [opt("a", a), opt("b", b), opt("u", undefined)],
    new Set<unknown>([b]),
    { multiple: true },
  );
  expect(state(set.select).selected).toEqual([false, true, false]);
  set.set(new Set<unknown>([undefined]));
  expect(state(set.select).selected).toEqual([false, false, true]);
  set.choose(0, 2);
  const written = set.writes[0] as Set<unknown>;
  expect(written).toBeInstanceOf(Set);
  expect(written.size).toBe(2);
  expect([...written][0]).toBe(a);
  expect(written.has(undefined)).toBe(true);
  expect(written.has("")).toBe(false);
  set.stop();

  const single = mount(
    () => [opt("a", a), opt("b", b), opt("u", undefined), opt("x", "x")],
    { id: 1 },
  );
  expect(state(single.select).index).toBe(0);
  single.set(undefined);
  expect(state(single.select).index).toBe(2);
  single.choose(3);
  single.choose(2);
  expect(single.writes).toHaveLength(2);
  expect(single.writes[0]).toBe("x");
  expect(single.writes[1]).toBeUndefined();
  single.choose(1);
  expect(single.writes[2]).toBe(b);
  single.stop();
});

test("omitted option values fall back to the DOM text", () => {
  const m = mount(() => [opt("alpha"), opt("beta")], "beta");
  expect(state(m.select).index).toBe(1);
  m.choose(0);
  expect(m.writes).toEqual(["alpha"]);
  m.stop();
});

test("programmatic Set mutations update multiple selection", () => {
  const model = ref(new Set<unknown>());
  const select = document.createElement("select");
  select.multiple = true;
  let stop!: () => void;
  let writes = 0;
  createRoot((dispose) => {
    stop = dispose;
    select.append(opt("x", "x"), opt("y", "y"));
    document.body.append(select);
    bindSelectModel(
      select,
      () => model.value,
      () => void writes++,
    );
  });
  expect(state(select).selected).toEqual([false, false]);
  model.value.add("x");
  expect(state(select).selected).toEqual([true, false]);
  model.value.add("y");
  expect(state(select).selected).toEqual([true, true]);
  model.value.delete("x");
  expect(state(select).selected).toEqual([false, true]);
  model.value = new Set<unknown>(["x"]);
  expect(state(select).selected).toEqual([true, false]);
  expect(writes).toBe(0);
  stop();
  model.value.add("y");
  expect(state(select).selected).toEqual([true, false]);
  select.remove();
});

test("no initial write and authored defaults are not adopted", () => {
  const m = mount(
    () => [opt("a", "a"), authored(opt("b", "b")), opt("c", "c")],
    "zzz",
  );
  expect(m.writes).toEqual([]);
  expect(state(m.select)).toEqual({
    selected: [false, false, false],
    index: -1,
  });
  expect(m.read()).toBe("zzz");
  m.stop();

  const multiple = mount(
    () => [authored(opt("a", "a")), opt("b", "b")],
    [] as string[],
    { multiple: true },
  );
  expect(multiple.writes).toEqual([]);
  expect(state(multiple.select).selected).toEqual([false, false]);
  multiple.stop();
});

test("a single select keeps the first of several loosely equal options", () => {
  const m = mount(() => [opt("one", 1), opt("uno", "1"), opt("two", 2)], "1");
  expect(state(m.select).selected).toEqual([true, false, false]);
  m.stop();
});

test("duplicate selection survives an immediate accepted write and re-resolves later", async () => {
  const m = mount(
    () => [opt("first", "a"), opt("second", "a"), opt("other", "b")],
    "b",
  );
  expect(state(m.select).index).toBe(2);
  m.choose(1);
  expect(m.writes).toEqual(["a"]);
  expect(m.read()).toBe("a");
  expect(state(m.select).index).toBe(1);
  await Promise.resolve();
  m.choose(2);
  expect(m.writes).toEqual(["a", "b"]);
  expect(state(m.select).index).toBe(2);
  await Promise.resolve();
  m.set("a");
  expect(state(m.select).index).toBe(0);
  m.stop();
});

test("multiple Set duplicates keep the user's pick through the accepted write", async () => {
  const m = mount(
    () => [opt("first", "a"), opt("second", "a")],
    new Set<unknown>(),
    { multiple: true },
  );
  m.choose(1);
  expect([...(m.writes[0] as Set<unknown>)]).toEqual(["a"]);
  expect(state(m.select).selected).toEqual([false, true]);
  await Promise.resolve();
  m.set(new Set<unknown>());
  m.set(new Set<unknown>(["a"]));
  expect(state(m.select).selected).toEqual([true, true]);
  m.stop();
});

test("number modifier parses numeric prefixes and keeps the rest", () => {
  const values = ["12px", "abc", "1.5e2x", "-3 apples", ".5", ""];
  const m = mount(
    () => values.map((value) => opt(value || "empty", value)),
    null,
    {
      number: true,
    },
  );
  values.forEach((_, index) => m.choose(index));
  expect(m.writes).toEqual([12, "abc", 150, -3, 0.5, ""]);
  m.stop();

  const plain = mount(() => [opt("a", "12px")], null);
  plain.choose(0);
  expect(plain.writes).toEqual(["12px"]);
  plain.stop();

  const target = { id: 1 };
  const typed = mount(
    () => [opt("n", 7), opt("o", target), opt("s", "9px"), opt("u", undefined)],
    null,
    { number: true },
  );
  typed.choose(0);
  typed.choose(1);
  typed.choose(2);
  typed.choose(3);
  expect(typed.writes[0]).toBe(7);
  expect(typed.writes[1]).toBe(target);
  expect(typed.writes[2]).toBe(9);
  expect(typed.writes[3]).toBeUndefined();
  typed.stop();

  const multiple = mount(
    () => values.slice(0, 3).map((value) => opt(value, value)),
    [] as unknown[],
    { multiple: true, number: true },
  );
  multiple.choose(0, 1, 2);
  expect(multiple.writes).toEqual([[12, "abc", 150]]);
  multiple.stop();
});

test("disposal removes the listener and render effect; roots are independent", async () => {
  const a = mount(oneTwo, "1");
  const b = mount(oneTwo, "1");
  a.stop();
  a.select.selectedIndex = 1;
  a.select.dispatchEvent(new Event("change"));
  expect(a.writes).toEqual([]);
  a.set("2");
  a.select.selectedIndex = 0;
  a.set("1");
  a.set("2");
  expect(a.select.selectedIndex).toBe(0);
  b.choose(1);
  expect(b.writes).toEqual(["2"]);
  await Promise.resolve();
  b.set("1");
  expect(b.select.selectedIndex).toBe(0);
  b.stop();
});

test("a select binds once per live root and can bind again after disposal", () => {
  const select = document.createElement("select");
  select.append(opt("one", "1"));
  document.body.append(select);
  const bind = () =>
    bindSelectModel(
      select,
      () => "1",
      () => {},
    );
  let first!: () => void;
  createRoot((dispose) => {
    first = dispose;
    bind();
    expect(() => bind()).toThrow("already has a model binding");
  });
  first();
  createRoot((dispose) => {
    bind();
    expect(select.selectedIndex).toBe(0);
    dispose();
  });
  select.remove();
});

test("validation requires a live owner, a select element and functions", () => {
  const select = document.createElement("select");
  expect(() =>
    bindSelectModel(
      select,
      () => 0,
      () => {},
    ),
  ).toThrow("live native owner");
  expect(() =>
    createSelectModel(
      {},
      () => 0,
      () => {},
      [],
    ),
  ).toThrow("live native owner");
  createRoot((stop) => {
    expect(() =>
      bindSelectModel(
        document.createElement("input") as unknown as HTMLSelectElement,
        () => 0,
        () => {},
      ),
    ).toThrow("select element");
    expect(() =>
      bindSelectModel(
        document.createElement("div") as unknown as HTMLSelectElement,
        () => 0,
        () => {},
      ),
    ).toThrow("select element");
    expect(() =>
      bindSelectModel(select, 1 as unknown as () => unknown, () => {}),
    ).toThrow("getter/setter");
    expect(() =>
      bindSelectModel(select, () => 0, null as unknown as () => void),
    ).toThrow("getter/setter");
    stop();
  });
});

test("factory registers the model before user handlers and selects built options synchronously", () => {
  const [read, set] = createSignal<unknown>("2");
  const order: string[] = [];
  let seen: unknown = "unset";
  let select!: HTMLSelectElement;
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    select = createSelectModel(
      {
        onChange: () => {
          order.push("handler");
          seen = read();
        },
      },
      read,
      (value) => {
        order.push("write");
        set(() => value);
      },
      [opt("one", "1"), opt("two", "2")],
    );
  });
  expect(order).toEqual([]);
  expect(state(select)).toEqual({ selected: [false, true], index: 1 });
  choose(select, 0);
  expect(order).toEqual(["write", "handler"]);
  expect(seen).toBe("1");
  stop();
});

test("factory applies props before the model and honours multiple Set policy", () => {
  let stop!: () => void;
  let select!: HTMLSelectElement;
  const writes: unknown[] = [];
  const target = { id: 1 };
  createRoot((dispose) => {
    stop = dispose;
    select = createSelectModel(
      { multiple: true, onChange: () => {} },
      () => new Set<unknown>([target]),
      (value) => void writes.push(value),
      [opt("a", {}), opt("b", target), authored(opt("c", "c"))],
    );
  });
  expect(select.multiple).toBe(true);
  expect(state(select).selected).toEqual([false, true, false]);
  expect(writes).toEqual([]);
  choose(select, 0, 1);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toBeInstanceOf(Set);
  expect((writes[0] as Set<unknown>).has(target)).toBe(true);
  stop();
});

test("accepted Set replacements retain later programmatic membership tracking", async () => {
  const model = ref(new Set<string>());
  let select!: HTMLSelectElement;
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    select = createSelectModel(
      { multiple: true },
      () => model.value,
      (value) => {
        model.value = value as Set<string>;
      },
      () => oneTwo(),
    );
  });
  choose(select, 0);
  await Promise.resolve();
  expect([...model.value]).toEqual(["1"]);
  model.value.add("2");
  expect(state(select).selected).toEqual([true, true]);
  model.value.delete("1");
  expect(state(select).selected).toEqual([false, true]);
  stop();
});

test("source scheduler reconciles numeric-prefix selection on a later component update", async () => {
  let stop!: () => void;
  let select!: HTMLSelectElement;
  let update!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withVueScheduler(() => {
      const [model, setModel] = createSignal<unknown>(1);
      const [other, setOther] = createSignal(0);
      update = () => {
        setOther((value) => value + 1);
      };
      createRenderEffect(() => {
        other();
      });
      const scope = captureSelectScope();
      select = h(() =>
        scope(() =>
          createSelectModel(
            {},
            model,
            (value) => setModel(() => value),
            [opt("one", "1"), opt("two", "2px")],
            true,
          ),
        ),
      ) as HTMLSelectElement;
    });
  });
  choose(select, 1);
  await Promise.resolve();
  expect(select.selectedIndex).toBe(1);
  update();
  await Promise.resolve();
  expect(select.selectedIndex).toBe(-1);
  stop();
});
