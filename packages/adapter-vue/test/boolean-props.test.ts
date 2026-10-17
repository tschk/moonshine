import { expect, test } from "bun:test";
import {
  createComputed,
  createRoot,
  createSignal,
} from "@tschk/moonshine-dom/reactive";
import {
  createProps,
  createBooleanProps,
  createServerProps,
  createServerBooleanProps,
  type BooleanProps,
} from "../src/props";
const keys = ["disabled", "first", "last", "flagName"];
const metadata: BooleanProps = [
  ["disabled", true],
  ["first", true],
  ["last", false],
  ["flagName", true],
];
const cases: Record<string, unknown>[] = [
  {},
  {
    disabled: undefined,
    first: undefined,
    last: undefined,
    flagName: undefined,
  },
  { disabled: false, first: false, last: false, flagName: false },
  { disabled: null, first: null, last: null, flagName: null },
  { disabled: "", first: "", last: "", flagName: "" },
  {
    disabled: "disabled",
    first: "first",
    last: "last",
    "flag-name": "flag-name",
  },
  { disabled: "false", first: "false", last: "false", flagName: "false" },
  { "flag-name": "" },
];
const encode = (props: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      [typeof value, value === undefined ? "UNDEFINED" : value],
    ]),
  );
// Exact production Vue3.5.13 typed-SFC DOM/SSR reference matrix (separate host proof).
const reference = [
  [false, false, false, false],
  [undefined, undefined, undefined, undefined],
  [false, false, false, false],
  [null, null, null, null],
  [true, true, "", true],
  [true, true, "last", true],
  ["false", "false", "false", "false"],
  [false, false, false, true],
].map((values) =>
  encode(Object.fromEntries(keys.map((key, index) => [key, values[index]]))),
);
function sourceView(read: () => Record<string, unknown>) {
  let source: Record<string, unknown>;
  source = new Proxy(
    {},
    {
      get: (_, key) => Reflect.get(read(), key, source),
      ownKeys: () => Reflect.ownKeys(read()),
      getOwnPropertyDescriptor: (_, key) =>
        Object.hasOwn(read(), key)
          ? { enumerable: true, configurable: true }
          : undefined,
    },
  );
  return source;
}
test("official typed Boolean matrix, live refresh, independent instances and stopped source", async () => {
  const [read, write] = createSignal(cases[0]!);
  let props!: Record<string, unknown>,
    sibling!: Record<string, unknown>,
    stop!: () => void;
  const trace: unknown[] = [];
  createRoot((dispose) => {
    stop = dispose;
    props = createBooleanProps<Record<string, unknown>>(
      sourceView(read),
      keys,
      metadata,
    );
    sibling = createBooleanProps<Record<string, unknown>>(
      { disabled: false, first: "", last: "", "flag-name": "" },
      keys,
      metadata,
    );
    createComputed(() => trace.push(props.disabled));
  });
  for (let i = 0; i < cases.length; i++) {
    write(cases[i]!);
    await Promise.resolve();
    expect(encode(props)).toEqual(reference[i]);
    expect(sibling.disabled).toBe(false);
    expect(sibling.flagName).toBe(true);
  }
  write({ disabled: "" });
  write({ disabled: false });
  expect(props.flagName).toBe(true);
  await Promise.resolve();
  expect(props.disabled).toBe(false);
  expect(props.flagName).toBe(false);
  stop();
  const count = trace.length;
  write({ disabled: true });
  await Promise.resolve();
  expect(trace).toHaveLength(count);
  expect(props.disabled).toBe(false);
});
test("SSR uses same cast metadata and isolated raw snapshots", () => {
  for (let i = 0; i < cases.length; i++)
    expect(
      encode(
        createServerBooleanProps<Record<string, unknown>>(
          cases[i]!,
          keys,
          metadata,
        ),
      ),
    ).toEqual(reference[i]);
  const source = { disabled: "" };
  const first = createServerBooleanProps<Record<string, unknown>>(
    source,
    keys,
    metadata,
  );
  source.disabled = "false";
  expect(first.disabled).toBe(true);
  expect(
    createServerBooleanProps<Record<string, unknown>>(source, keys, metadata)
      .disabled,
  ).toBe("false");
});
test("presence changes despite equal raw undefined, receiver getters exactly once per refresh", async () => {
  const [shape, set] = createSignal<Record<string, unknown>>({});
  let reads = 0;
  let source: Record<string, unknown>;
  source = new Proxy(
    {},
    {
      ownKeys: () => Reflect.ownKeys(shape()),
      getOwnPropertyDescriptor: (_, k) =>
        Object.hasOwn(shape(), k)
          ? { enumerable: true, configurable: true }
          : undefined,
      get: (_, k, receiver) => {
        expect(receiver).toBe(source);
        reads++;
        return Reflect.get(shape(), k);
      },
    },
  );
  let props!: Record<string, unknown>, stop!: () => void;
  createRoot((d) => {
    stop = d;
    props = createBooleanProps<Record<string, unknown>>(source, keys, metadata);
  });
  expect(props.disabled).toBe(false);
  expect(reads).toBe(0);
  set({ disabled: undefined });
  await Promise.resolve();
  expect(props.disabled).toBeUndefined();
  expect(reads).toBe(1);
  set({});
  await Promise.resolve();
  expect(props.disabled).toBe(false);
  expect(reads).toBe(1);
  stop();
  set({ disabled: "" });
  await Promise.resolve();
  expect(reads).toBe(1);
  let ssrReads = 0;
  const serverSource = {
    get flagName() {
      ssrReads++;
      expect(this).toBe(serverSource);
      return "";
    },
  };
  expect(
    createServerBooleanProps<Record<string, unknown>>(
      serverSource,
      ["flagName"],
      [["flagName", true]],
    ).flagName,
  ).toBe(true);
  expect(ssrReads).toBe(1);
});
test("camel/hyphen duplicate order and own prototype-named keys remain safe", () => {
  for (const raw of [
    { "flag-name": "", flagName: false },
    { flagName: false, "flag-name": "" },
  ]) {
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      const props = createBooleanProps<Record<string, unknown>>(
        raw,
        ["flagName"],
        [["flagName", true]],
      );
      expect(props.flagName).toBe(Object.keys(raw)[1] !== "flagName");
    });
    stop();
    expect(
      createServerBooleanProps<Record<string, unknown>>(
        raw,
        ["flagName"],
        [["flagName", true]],
      ).flagName,
    ).toBe(Object.keys(raw)[1] !== "flagName");
  }
  const raw = JSON.parse('{"__proto__":"","constructor":"constructor"}');
  const server = createServerBooleanProps<Record<string, unknown>>(
    raw,
    ["__proto__", "constructor"],
    [
      ["__proto__", true],
      ["constructor", true],
    ],
  );
  expect(Object.getPrototypeOf(server)).toBe(Object.prototype);
  expect(Object.hasOwn(server, "__proto__")).toBe(true);
  expect(Reflect.get(server, "__proto__")).toBe(true);
  expect(Reflect.get(server, "constructor")).toBe(true);
});
test("legacy helper without metadata preserves missing undefined and raw-key behavior", () => {
  expect(
    createServerProps<Record<string, unknown>>({}, ["disabled"]).disabled,
  ).toBeUndefined();
  expect(
    createServerProps<Record<string, unknown>>({ "flag-name": "" }, [
      "flagName",
    ]).flagName,
  ).toBeUndefined();
  createRoot((stop) => {
    expect(
      createProps<Record<string, unknown>>({}, ["disabled"]).disabled,
    ).toBeUndefined();
    stop();
  });
});

test("SSR aliases preserve declared-getter receiver/count without reading unrelated fields", () => {
  let reads = 0;
  const source = {
    get "flag-name"() {
      expect(this).toBe(source);
      reads++;
      return "";
    },
    get unrelated() {
      throw Error("undeclared getter");
    },
  };
  const props = createServerBooleanProps<Record<string, unknown>>(
    source,
    ["flagName"],
    [["flagName", true]],
  );
  expect(props.flagName).toBe(true);
  expect(reads).toBe(1);
  expect(Object.keys(props)).toEqual(["flagName"]);
});

test("mixed cast props follow ordinary keys then declared cast order; inherited initial values clear on own refresh", async () => {
  const ordered = ["flagName", "label", "disabled"];
  const casts: BooleanProps = [
    ["flagName", true],
    ["disabled", true],
  ];
  for (const raw of [
    { "flag-name": "", flagName: false, label: "a" },
    { flagName: false, "flag-name": "", label: "b" },
  ]) {
    createRoot((stop) => {
      const props = createBooleanProps<Record<string, unknown>>(
        raw,
        ordered,
        casts,
      );
      expect(Object.keys(props)).toEqual(["label", "flagName", "disabled"]);
      expect(props.flagName).toBe(raw.label === "b");
      stop();
    });
    const server = createServerBooleanProps<Record<string, unknown>>(
      raw,
      ordered,
      casts,
    );
    expect(Object.keys(server)).toEqual(["label", "flagName", "disabled"]);
    expect(server.flagName).toBe(raw.label === "b");
  }
  const [read, write] = createSignal("initial");
  let props!: Record<string, unknown>, stop!: () => void;
  const source: Record<string, unknown> = Object.create({ "flag-name": "" });
  Object.defineProperty(source, "label", {
    get: read,
    enumerable: true,
    configurable: true,
  });
  createRoot((d) => {
    stop = d;
    props = createBooleanProps<Record<string, unknown>>(source, ordered, casts);
  });
  expect(props.flagName).toBe(true);
  write("refreshed");
  await Promise.resolve();
  expect(props.label).toBe("refreshed");
  expect(props.flagName).toBe(false);
  stop();
});
test("same-final parent bounce preserves local edits and pending queue cancels on stop", async () => {
  const [read, write] = createSignal<Record<string, unknown>>({ disabled: "" });
  let props!: Record<string, unknown>, stop!: () => void;
  createRoot((d) => {
    stop = d;
    props = createBooleanProps(sourceView(read), keys, metadata);
  });
  props.disabled = false;
  write({ disabled: false });
  write({ disabled: "" });
  await Promise.resolve();
  expect(props.disabled).toBe(false);
  write({ disabled: "disabled" });
  stop();
  await Promise.resolve();
  expect(props.disabled).toBe(false);
});
