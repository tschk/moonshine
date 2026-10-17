import { expect, test } from "bun:test";
import { mergeProps, splitProps } from "../src/solid";
import {
  createComputed,
  createRoot,
  createSignal,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as serverH, renderToString } from "@tschk/moonshine-dom/ssr";
import "../../react/test/dom";

test("plain props preserve lazy getters, receivers, fallback and descriptor copies", () => {
  let reads = 0;
  let title: string | undefined = "live";
  const source = {
    marker: "receiver",
    get title() {
      reads++;
      expect(this.marker).toBe("receiver");
      return title;
    },
  };
  const merged = mergeProps({ title: "default" }, source);
  expect(reads).toBe(0);
  expect(merged.title).toBe("live");
  title = undefined;
  expect(merged.title).toBe("default");
  expect(reads).toBe(2);
  expect(() => {
    (merged as any).title = "ignored";
  }).toThrow();
  const data = { value: 1 };
  const copy = mergeProps(data);
  data.value = 2;
  expect(copy.value).toBe(1);
  copy.value = 3;
  expect(copy.value).toBe(3);
  const descriptor = {
    get() {
      return this.value;
    },
    enumerable: false,
    configurable: false,
  };
  const plain = Object.defineProperty({ value: 4 }, "hidden", descriptor);
  const [local, rest] = splitProps(plain, ["value"], ["value"]);
  expect(local.value).toBe(4);
  expect(Object.keys(rest)).toEqual([]);
  const split = splitProps(plain)[0];
  expect(Object.getOwnPropertyDescriptor(split, "hidden")).toEqual(descriptor);
  expect((split as any).hidden).toBe(4);
});

test("plain sources snapshot string names, ignore symbols and inherited keys", () => {
  const symbol = Symbol("user");
  const source = Object.assign(Object.create({ inherited: 2 }), {
    [symbol]: 3,
    value: undefined,
  });
  Object.defineProperty(source, "hidden", { value: 7 });
  Object.defineProperty(source, "__proto__", {
    value: "safe",
    enumerable: true,
  });
  const merged = mergeProps(null, false, undefined, source);
  expect(Object.keys(merged)).toEqual(["value", "hidden"]);
  expect((merged as any)[symbol]).toBeUndefined();
  expect("inherited" in merged).toBe(false);
  expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
  const [part, rest] = splitProps(source, ["value"]);
  expect(Object.keys(part)).toEqual(["value"]);
  expect(Object.getOwnPropertySymbols(rest)).toEqual([]);
  expect(Object.getOwnPropertyDescriptor(rest, "__proto__")?.value).toBe(
    "safe",
  );
});

test("function sources memoize evaluation and expose readonly live views", () => {
  createRoot((stop) => {
    const symbol = Symbol("user");
    const [source, setSource] = createSignal<any>({
      value: "one",
      extra: 1,
      [symbol]: 5,
    });
    let calls = 0;
    const merged = mergeProps({ value: "fallback" }, () => {
      calls++;
      return source();
    });
    expect(calls).toBe(1);
    const [local, rest] = splitProps(merged, ["value", symbol]);
    expect(local.value).toBe("one");
    expect((local as any)[symbol]).toBe(5);
    expect(Reflect.ownKeys(merged)).toEqual(["value", "extra"]);
    expect(Reflect.ownKeys(local)).toEqual(["value", symbol]);
    expect(Object.hasOwn(merged, "missing")).toBe(true);
    expect("missing" in merged).toBe(false);
    (local as any).value = "ignored";
    delete (merged as any).extra;
    expect(local.value).toBe("one");
    expect((rest as any).extra).toBe(1);
    setSource(
      Object.assign(Object.create({ inherited: 9 }), {
        value: undefined,
        next: 2,
      }),
    );
    expect(local.value).toBe("fallback");
    expect(Object.keys(rest)).toEqual(["next"]);
    expect((merged as any).inherited).toBe(9);
    expect("inherited" in merged).toBe(true);
    expect(calls).toBe(2);
    setSource(undefined);
    expect(local.value).toBe("fallback");
    expect(Object.keys(rest)).toEqual([]);
    stop();
  });
});

test("live prop getters drive native components and dispose with the owner", () => {
  const [value, setValue] = createSignal<string | undefined>("one");
  let factories = 0,
    renders = 0,
    cleanups = 0;
  const target = document.createElement("div");
  const stop = render(() => {
    const props = mergeProps({ value: "fallback" }, () => {
      factories++;
      return { value: value() };
    });
    const [local] = splitProps(props, ["value"]);
    onCleanup(() => cleanups++);
    createComputed(() => {
      void local.value;
      renders++;
    });
    return h("span", null, () => local.value);
  }, target);
  const node = target.firstChild;
  expect(target.textContent).toBe("one");
  setValue(undefined);
  expect(target.textContent).toBe("fallback");
  setValue("two");
  expect(target.textContent).toBe("two");
  expect(target.firstChild).toBe(node);
  expect(factories).toBe(3);
  expect(renders).toBe(3);
  stop();
  setValue("late");
  expect(factories).toBe(3);
  expect(cleanups).toBe(1);
  expect(target.childNodes.length).toBe(0);
  expect(
    renderToString(() => {
      const props = mergeProps(
        { value: "default" },
        {
          get value() {
            return "<server>";
          },
        },
      );
      return serverH("b", null, () => props.value);
    }),
  ).toBe("<b>&lt;server&gt;</b>");
});

function exercise(api: {
  mergeProps: (...sources: any[]) => any;
  splitProps: (...args: any[]) => any;
  createRoot: any;
  createSignal: any;
}) {
  return api.createRoot((stop: () => void) => {
    const symbol = Symbol("user");
    let reads = 0;
    const source = Object.assign(Object.create({ inherited: 8 }), {
      marker: "receiver",
      [symbol]: 7,
    });
    Object.defineProperty(source, "title", {
      enumerable: true,
      get() {
        reads++;
        return this.marker;
      },
    });
    Object.defineProperty(source, "hidden", { value: 9 });
    const plain = api.mergeProps({ title: "default" }, source);
    const beforeRead = reads;
    const title = plain.title;
    const plainKeys = Reflect.ownKeys(plain);
    const split = api.splitProps(source, ["title"], ["title"]);
    const splitDescriptor = Object.getOwnPropertyDescriptor(split[0], "title");
    const [current, setCurrent] = api.createSignal({
      value: "one",
      [symbol]: 7,
      extra: 1,
    });
    let calls = 0;
    const live = api.mergeProps({ value: "default" }, () => {
      calls++;
      return current();
    });
    const [local, rest] = api.splitProps(live, ["value", symbol]);
    const initial = [
      local.value,
      local[symbol],
      Object.keys(rest),
      Reflect.ownKeys(live),
      Object.hasOwn(live, "missing"),
      "missing" in live,
    ];
    local.value = "ignored";
    delete live.extra;
    const ignored = [local.value, rest.extra];
    setCurrent(
      Object.assign(Object.create({ inherited: 8 }), {
        value: undefined,
        other: 2,
      }),
    );
    const changed = [
      local.value,
      Object.keys(rest),
      live.inherited,
      "inherited" in live,
    ];
    setCurrent(null);
    const absent = [local.value, Object.keys(rest)];
    const result = {
      beforeRead,
      title,
      plainKeys,
      plainSymbol: plain[symbol],
      inherited: "inherited" in plain,
      splitKeys: split.map((part: object) => Reflect.ownKeys(part)),
      splitGetter:
        splitDescriptor?.get ===
        Object.getOwnPropertyDescriptor(source, "title")?.get,
      initial,
      ignored,
      changed,
      absent,
      calls,
    };
    stop();
    return result;
  });
}

const serialize = (value: unknown) =>
  JSON.stringify(value, (_, item) =>
    typeof item === "symbol" ? item.description : item,
  );

test("matches installed Solid 1.9 prop composition on plain and function sources", async () => {
  const { dirname, join } = await import("node:path");
  const pkg = Bun.resolveSync("solid-js/package.json", import.meta.dir);
  const reference = await import(join(dirname(pkg), "dist/solid.js"));
  const native = await import("../src/solid");
  // Symbol identity is local to each exercise; compare its description through serialization.
  expect(serialize(exercise(native))).toBe(serialize(exercise(reference)));
});
