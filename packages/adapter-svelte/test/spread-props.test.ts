import { expect, test } from "bun:test";
import { spreadProps, spreadServerProps } from "../src/spread-props";
import { createState } from "../src/state";
import { createProp } from "../src/prop";
import { createRoot, createComputed } from "@tschk/moonshine-dom/reactive";

test("live layers resolve lazily with rightmost precedence and original getter receivers", () => {
  const events: string[] = [];
  let first = {
    marker: "first",
    get value() {
      events.push(this.marker);
      return this.marker;
    },
  };
  let second: Record<string, unknown> = { marker: "second" };
  const props = spreadProps(
    () => {
      events.push("layer:first");
      return first;
    },
    () => {
      events.push("layer:second");
      return second;
    },
  );
  expect(events).toEqual([]);
  expect(props.value).toBe("first");
  expect(props.value).toBe("first");
  expect(events).toEqual([
    "layer:second",
    "layer:first",
    "first",
    "layer:second",
    "layer:first",
    "first",
  ]);
  second.value = "override";
  expect(props.value).toBe("override");
  delete second.value;
  expect(props.value).toBe("first");
  first = {
    marker: "new",
    get value() {
      return this.marker;
    },
  };
  second = { extra: 3 };
  expect(props.value).toBe("new");
  expect(props.extra).toBe(3);
  expect(Object.keys(props)).toEqual(["marker", "value", "extra"]);
});

test("live enumeration preserves symbols, inherited lookup and winning descriptor visibility", () => {
  const symbol = Symbol("visible"),
    hidden = Symbol("hidden");
  const first = Object.create({ inherited: 1 });
  first.value = 2;
  Object.defineProperty(first, symbol, { value: 3, enumerable: true });
  Object.defineProperty(first, hidden, { value: 4 });
  const props = spreadProps(first, { value: 5 });
  expect(props.inherited).toBe(1);
  expect("inherited" in props).toBe(true);
  expect(Reflect.ownKeys(props)).toEqual([
    "value",
    "inherited",
    symbol,
    hidden,
  ]);
  expect(Object.keys(props)).toEqual(["value"]);
  expect(props[symbol]).toBe(3);
  expect(props[hidden]).toBe(4);
  expect(Object.getOwnPropertyDescriptor(props, symbol)?.configurable).toBe(
    true,
  );
  const masked = spreadProps(
    { x: 1 },
    Object.defineProperty({}, "x", { value: 2, enumerable: false }),
  );
  expect(Object.keys(masked)).toEqual([]);
  expect(masked.x).toBe(2);
});

test("live assignment finds older setters without writing readonly data layers", () => {
  let descriptorReceiver = false,
    value: unknown;
  const props = spreadProps(
    null,
    {
      set value(next) {
        descriptorReceiver =
          typeof (this as unknown as PropertyDescriptor).set === "function";
        value = next;
      },
    },
    { value: "shadow" },
  );
  expect(Reflect.set(props, "value", 7)).toBe(true);
  expect(value).toBe(7);
  expect(descriptorReceiver).toBe(true);
  expect(props.value).toBe("shadow");
  expect(Reflect.set(props, "missing", 8)).toBe(false);
  const nullish = spreadProps(
    {
      set value(next) {
        value = next;
      },
    },
    null,
    undefined,
  );
  expect(Reflect.set(nullish, "value", 9)).toBe(true);
  expect(value).toBe(9);
});

test("server snapshots descriptors without invoking getters and isolates independent results", () => {
  let calls = 0;
  const symbol = Symbol();
  const source = {
    marker: "source",
    get value() {
      calls++;
      return this.marker;
    },
  };
  Object.defineProperty(source, symbol, { value: 1, enumerable: true });
  const merged = spreadServerProps([null, source, { marker: "merged" }]);
  expect(calls).toBe(0);
  expect(merged.value).toBe("merged");
  expect(merged.value).toBe("merged");
  expect(calls).toBe(2);
  expect(Reflect.ownKeys(merged)).toEqual(["marker", "value"]);
  source.marker = "changed";
  expect(merged.marker).toBe("merged");
  const another = spreadServerProps([source]);
  expect(another.value).toBe("changed");
  expect(another).not.toBe(merged);
  const fixed = Object.defineProperty({}, "value", {
    value: 1,
    enumerable: true,
    configurable: false,
  });
  expect(() => spreadServerProps([fixed, { value: 2 }])).toThrow(TypeError);
});

test("reactive layers retain createProp identity and support replacement, deletion and bound descriptors", () => {
  const state = createState<Record<string, unknown>>({ value: 1, extra: 2 });
  const seen: unknown[] = [];
  const stop = createRoot((dispose) => {
    const props = spreadProps(() => state.value);
    const value = createProp(props, "value", { fallback: () => "missing" });
    createComputed(() => seen.push(value.value));
    state.value.value = 3;
    state.value = { value: 4 };
    delete state.value.value;
    expect(seen).toEqual([1, 3, 4, "missing"]);
    const parent = createState(2);
    const bound = createProp<number>(
      spreadProps({
        get value() {
          return parent.value;
        },
        set value(next) {
          parent.value = next;
        },
      }),
      "value",
      { bindable: true },
    );
    bound.value = 8;
    expect(parent.value).toBe(8);
    return dispose;
  });
  stop();
  state.value = { value: 9 };
  expect(seen).toEqual([1, 3, 4, "missing"]);
});

test("layered descriptor semantics match installed Svelte client and server", async () => {
  function exercise(
    live: typeof spreadProps,
    server: typeof spreadServerProps,
  ) {
    const symbol = Symbol("visible"),
      hidden = Symbol("hidden");
    let reads = 0,
      layers = 0;
    let source = Object.assign(Object.create({ inherited: 7 }), {
      marker: "source",
      get value() {
        return "unused";
      },
    });
    Object.defineProperty(source, "value", {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return this.marker;
      },
    });
    Object.defineProperty(source, symbol, { value: 3, enumerable: true });
    Object.defineProperty(source, hidden, { value: 4 });
    const overlay: Record<string, unknown> = { marker: "overlay" };
    const props = live(() => {
      layers++;
      return source;
    }, overlay);
    const constructed = [reads, layers];
    const values = [props.value, props.value];
    const accessed = [reads, layers];
    const keys = Reflect.ownKeys(props).map((key) =>
      typeof key === "symbol" ? key.description : key,
    );
    const symbols = [props[symbol], props[hidden]];
    overlay.value = "override";
    values.push(props.value);
    delete overlay.value;
    values.push(props.value);
    const snapshot = server([source, overlay]);
    const serverValue = snapshot.value;
    source = { value: "replacement", fresh: 9 };
    const replaced = [props.value, props.fresh, "inherited" in props];
    let assigned = 0,
      descriptorReceiver = false;
    const setter = live(
      {
        set value(next: number) {
          assigned = next;
          descriptorReceiver =
            typeof (this as unknown as PropertyDescriptor).set === "function";
        },
      },
      { value: "shadow" },
    );
    const written = Reflect.set(setter, "value", 8);
    return {
      constructed,
      values,
      accessed,
      keys,
      symbols,
      serverValue,
      replaced,
      written,
      assigned,
      descriptorReceiver,
      serverKeys: Reflect.ownKeys(snapshot),
    };
  }
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL(
    "./src/internal/client/reactivity/props.js",
    `file://${pkg}`,
  ).pathname;
  const server = new URL("./src/internal/server/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import{spread_props as live}from${JSON.stringify(client)};import{spread_props as server}from${JSON.stringify(server)};console.log(JSON.stringify((${exercise.toString()})(live,server)));`,
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
  expect(exercise(spreadProps, spreadServerProps)).toEqual(JSON.parse(output));
});
