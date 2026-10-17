import { afterEach, expect, test } from "bun:test";
import "../../react/test/dom";
import { createRoot, createSignal } from "@tschk/moonshine-dom/reactive";
import { createState, stateEquals } from "../src/state";
import {
  bindSelectValue,
  bindValue,
  createInputGroup,
  setOptionValue,
  setInputValue,
} from "../src/binding";
const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  document.body.replaceChildren();
});

test("state identity comparison preserves nested origins, cached proxies and reassignment", () => {
  const raw = { nested: { value: 1 } };
  const state = createState(raw);
  const cached = state.value;
  expect(stateEquals(raw, cached)).toBe(true);
  expect(stateEquals(raw.nested, cached.nested)).toBe(true);
  expect(cached.nested).toBe(cached.nested);
  cached.nested.value = 2;
  expect(stateEquals(raw.nested, cached.nested)).toBe(true);
  expect(stateEquals(raw, { nested: raw.nested })).toBe(false);
  state.value = raw;
  expect(stateEquals(state.value, cached)).toBe(true);
  expect(state.value.nested.value).toBe(1);
  expect(cached.nested.value).toBe(2);
  const other = { nested: { value: 1 } };
  state.value = other;
  expect(stateEquals(state.value, raw)).toBe(false);
  expect(stateEquals(state.value, other)).toBe(true);
});

test("single select compares origins and writes the exact option proxy with overlay intact", () => {
  const raw = { label: "raw" };
  const proxy = createState(raw).value;
  proxy.label = "edited";
  const select = document.createElement("select");
  const option = document.createElement("option");
  const other = document.createElement("option");
  select.append(option, other);
  setOptionValue(option, proxy);
  setOptionValue(other, { label: "raw" });
  const [read, write] = createSignal<unknown>(raw);
  stops.push(
    createRoot((stop) => {
      bindSelectValue(select, read, write);
      return stop;
    }),
  );
  expect(option.selected).toBe(true);
  other.selected = true;
  option.selected = true;
  select.dispatchEvent(new Event("change"));
  expect(read()).toBe(proxy);
  expect((read() as typeof raw).label).toBe("edited");
  expect(raw.label).toBe("raw");
  write({ label: "raw" });
  expect(select.selectedIndex).toBe(-1);
});

test("radio compares origins without normalizing emitted values", () => {
  const raw = { label: "raw" },
    proxy = createState(raw).value;
  proxy.label = "edited";
  const input = document.createElement("input");
  input.type = "radio";
  setInputValue(input, proxy);
  const [read, write] = createSignal<unknown>(raw);
  stops.push(
    createRoot((stop) => {
      createInputGroup("radio", read, write).bind(input);
      return stop;
    }),
  );
  expect(input.checked).toBe(true);
  input.dispatchEvent(new Event("change"));
  expect(read()).toBe(proxy);
  expect(proxy.label).toBe("edited");
  write({ label: "raw" });
  expect(input.checked).toBe(false);
});

test("multiple select and checkbox retain includes identity semantics", () => {
  const raw = {},
    proxy = createState(raw).value;
  const select = document.createElement("select");
  select.multiple = true;
  const option = document.createElement("option");
  select.append(option);
  setOptionValue(option, proxy);
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  setInputValue(checkbox, proxy);
  const [read, write] = createSignal<unknown>([raw]);
  stops.push(
    createRoot((stop) => {
      bindSelectValue(select, read, write);
      createInputGroup("checkbox", read, write).bind(checkbox);
      return stop;
    }),
  );
  expect(option.selected).toBe(false);
  expect(checkbox.checked).toBe(false);
  write([proxy]);
  expect(option.selected).toBe(true);
  expect(checkbox.checked).toBe(true);
});

test("origin comparison matches installed Svelte without replacing edited proxies", async () => {
  function exercise(
    wrap: <T>(value: T) => T,
    equal: (a: unknown, b: unknown) => boolean,
  ) {
    const raw = { nested: { value: 1 } };
    const proxy = wrap(raw);
    proxy.nested.value = 2;
    return [
      equal(raw, proxy),
      equal(raw.nested, proxy.nested),
      equal(raw, { ...raw }),
      proxy.nested.value,
      raw.nested.value,
      equal(NaN, NaN),
      equal(0, -0),
    ];
  }
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const proxyFile = new URL("./src/internal/client/proxy.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import {proxy,is} from ${JSON.stringify(proxyFile)}; console.log(JSON.stringify((${exercise.toString()})(proxy,is)));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  expect(exercise((value) => createState(value).value, stateEquals)).toEqual(
    JSON.parse(output),
  );
});

test("Svelte numeric bindings write null for empty values and retain defaults, reset and formatting", async () => {
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "number";
  input.defaultValue = "02";
  form.append(input);
  document.body.append(form);
  const [read, write] = createSignal<string | number | null | undefined>(
    undefined,
  );
  const values: unknown[] = [];
  stops.push(
    createRoot((stop) => {
      bindValue(input, read, (value) => {
        values.push(value);
        write(value);
      });
      return stop;
    }),
  );
  expect(read()).toBe(2);
  expect(input.value).toBe("02");
  input.value = "";
  input.dispatchEvent(new Event("input"));
  expect(read()).toBeNull();
  expect(typeof read()).toBe("object");
  input.value = "03";
  input.dispatchEvent(new Event("input"));
  expect(read()).toBe(3);
  expect(input.value).toBe("03");
  form.reset();
  await Promise.resolve();
  expect(read()).toBe(2);
  expect(input.value).toBe("02");
  expect(values).toEqual([2, null, 3, 2]);
});

test("Svelte text bindings keep empty strings", () => {
  const input = document.createElement("input");
  const [read, write] = createSignal<string | number | null>("hello");
  stops.push(
    createRoot((stop) => {
      bindValue(input, read, write);
      return stop;
    }),
  );
  input.value = "";
  input.dispatchEvent(new Event("input"));
  expect(read()).toBe("");
});

test("empty numeric values match actual pinned Svelte bind_value including typeof", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const bindings = new URL(
    "./src/internal/client/dom/elements/bindings/input.js",
    `file://${pkg}`,
  ).pathname;
  const dom = new URL("../../react/test/dom.ts", import.meta.url).pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import ${JSON.stringify(dom)};import{effect_root}from${JSON.stringify(client)};import{bind_value}from${JSON.stringify(bindings)};let value=4;const input=document.createElement('input'),form=document.createElement('form');input.type='number';form.append(input);document.body.append(form);const stop=effect_root(()=>bind_value(input,()=>value,next=>value=next));input.value='';input.dispatchEvent(new Event('input'));const empty={null:value===null,type:typeof value};input.defaultValue='invalid';form.reset();await Promise.resolve();await Promise.resolve();const resetNaN=Number.isNaN(value);input.value='';input.dispatchEvent(new Event('input'));console.log(JSON.stringify({empty,resetNaN,inputNull:value===null}));await Promise.resolve();stop();`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  expect(JSON.parse(output)).toEqual({
    empty: { null: true, type: "object" },
    resetNaN: true,
    inputNull: true,
  });
});

test("invalid numeric defaults reset to NaN but genuine empty input writes null", async () => {
  const form = document.createElement("form"),
    input = document.createElement("input");
  input.type = "number";
  input.defaultValue = "invalid";
  form.append(input);
  document.body.append(form);
  const [read, write] = createSignal<string | number | null>(3);
  stops.push(
    createRoot((stop) => {
      bindValue(input, read, write);
      return stop;
    }),
  );
  form.reset();
  await Promise.resolve();
  expect(Number.isNaN(read())).toBe(true);
  input.value = "";
  input.dispatchEvent(new Event("input"));
  expect(read()).toBeNull();
  input.defaultValue = "";
  write(4);
  form.reset();
  await Promise.resolve();
  expect(read()).toBeNull();
});
