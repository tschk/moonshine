import { expect, test } from "bun:test";
import { createComputed, createRoot } from "@tschk/moonshine-dom/reactive";
import { createState, stateSnapshot } from "../src/state";

test("deep writes are isolated from raw input, aliases cache per property", () => {
  const shared = { count: 1 },
    raw = { a: shared, b: shared };
  const state = createState(raw);
  expect(state.value.a).toBe(state.value.a);
  expect(state.value.a).not.toBe(state.value.b);
  state.value.a.count = 2;
  expect(state.value.b.count).toBe(1);
  expect(shared.count).toBe(1);
  state.value.b = state.value.a;
  expect(state.value.b).toBe(state.value.a);
  const other = createState(raw);
  expect(other.value.a.count).toBe(1);
});

test("undefined is an own value distinct from deletion; keys and existence track", () => {
  const state = createState<Record<string, unknown>>({});
  const reads: unknown[] = [],
    keys: string[] = [],
    has: boolean[] = [];
  createRoot((stop) => {
    createComputed(() => {
      reads.push(state.value.x);
    });
    createComputed(() => {
      keys.push(Object.keys(state.value).join(","));
    });
    createComputed(() => {
      has.push("x" in state.value);
    });
    state.value.x = undefined;
    expect(Object.hasOwn(state.value, "x")).toBe(true);
    delete state.value.x;
    expect(Object.hasOwn(state.value, "x")).toBe(false);
    expect(keys).toEqual(["", "x", ""]);
    expect(has).toEqual([false, true, false]);
    expect(reads).toEqual([undefined, undefined, undefined]);
    stop();
  });
});

test("array methods are transactions and truncation clears index dependencies", () => {
  const raw = [1, 2, 3],
    state = createState(raw);
  const seen: string[] = [],
    third: unknown[] = [];
  createRoot((stop) => {
    createComputed(() => {
      seen.push(state.value.join(","));
    });
    createComputed(() => {
      third.push(state.value[2]);
    });
    state.value.splice(0, 2, 4, 5);
    expect(seen).toEqual(["1,2,3", "4,5,3"]);
    state.value.length = 1;
    expect(third).toEqual([3, undefined]);
    expect(2 in state.value).toBe(false);
    state.value.push(7, 8);
    expect(seen).toEqual(["1,2,3", "4,5,3", "4", "4,7,8"]);
    stop();
  });
  expect(raw).toEqual([1, 2, 3]);
});

test("cells preserve function assignment and object replacement", () => {
  let count = 0;
  const initial = () => ++count,
    next = () => --count;
  const state = createState(initial);
  state.value = next;
  expect(state.value).toBe(next);
  expect(count).toBe(0);
  const object = createState({ count: 1 });
  object.value = { count: 2 };
  expect(object.value.count).toBe(2);
});

test("opaque prototypes remain untouched and descriptors reject explicitly", () => {
  const date = new Date(),
    map = new Map(),
    nullProto = Object.create(null);
  const state = createState({ date, map, nullProto });
  expect(state.value.date).toBe(date);
  expect(state.value.map).toBe(map);
  expect(state.value.nullProto).toBe(nullProto);
  expect(() => createState(Object.freeze({ value: 1 }))).toThrow(
    "ordinary writable",
  );
  expect(() =>
    createState({
      get value() {
        return 1;
      },
    }),
  ).toThrow("ordinary writable");
  expect(() => Object.setPrototypeOf(state.value, null)).toThrow("prototype");
  expect(() => Object.freeze(state.value)).toThrow("extensible");
});

test("snapshot detaches plain data, preserves explicit aliases/cycles and holes", () => {
  // oxlint-disable-next-line unicorn/no-new-array -- sparse arrays are the case under test.
  const state = createState<any>({ a: { count: 1 }, sparse: new Array(2) });
  state.value.b = state.value.a;
  state.value.self = state.value;
  const copy = stateSnapshot(state.value);
  expect(copy).not.toBe(state.value);
  expect(copy.a).toBe(copy.b);
  expect(copy.self).toBe(copy);
  expect(0 in copy.sparse).toBe(false);
  copy.a.count = 4;
  expect(state.value.a.count).toBe(1);
  const raw: any = {};
  raw.self = raw;
  const cyclic = createState(raw);
  expect(cyclic.value.self).toBe(cyclic.value.self);
  const cyclicCopy = stateSnapshot(cyclic.value);
  expect(cyclicCopy.self).toBe(cyclicCopy);
  const date = new Date();
  expect(stateSnapshot({ date }).date).not.toBe(date);
});

test("plain mutation semantics match installed Svelte proxy in isolation", async () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- serialized into isolated reference subprocess.
  function exercise(proxy: (value: any) => any) {
    const shared = { count: 1 },
      raw = { a: shared, b: shared, list: [1, 2, 3] };
    const value = proxy(raw);
    const identity = [value.a === value.a, value.a === value.b];
    value.a.count = 2;
    value.list.splice(0, 2, 4, 5);
    value.list.length = 1;
    value.list.push(7, 8);
    value.missing = undefined;
    const undefinedOwn = Object.hasOwn(value, "missing");
    delete value.missing;
    const deleted = "missing" in value;
    value.b = value.a;
    return {
      identity,
      a: value.a.count,
      b: value.b.count,
      shared: value.a === value.b,
      list: [...value.list],
      raw,
      undefinedOwn,
      deleted,
    };
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
      `import { proxy } from ${JSON.stringify(proxyFile)}; console.log(JSON.stringify((${exercise.toString()})(proxy)));`,
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
  expect(exercise((value) => createState(value).value)).toEqual(
    JSON.parse(output),
  );
});

test("prototype-looking own keys remain data without changing prototypes", () => {
  const state = createState<Record<string, unknown>>({});
  state.value.__proto__ = { secret: true };
  expect(Object.getPrototypeOf(state.value)).toBe(Object.prototype);
  expect(Object.hasOwn(state.value, "__proto__")).toBe(true);
  expect((state.value as any).secret).toBe(undefined);
});

test("lazy raw capture and external keys/deletes/array lengths match installed Svelte", async () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- shared exact probe serialized into reference subprocess.
  function exercise(proxy: (value: any) => any) {
    const raw: any = { first: 1, captured: 2, removed: 3 };
    const value = proxy(raw);
    const initialKeys = Object.keys(value);
    raw.first = 10;
    const first = value.first;
    const captured = value.captured;
    raw.first = 11;
    raw.captured = 20;
    raw.added = 4;
    delete raw.removed;
    const externalKeys = Object.keys(value);
    const next = [value.first, value.captured, value.added, value.removed];
    delete raw.captured;
    const retainedKeys = Object.keys(value);
    const retained = value.captured;
    const missing = value.future;
    raw.future = 5;
    const future = [
      value.future,
      "future" in value,
      Object.keys(value).includes("future"),
    ];
    value.first = 12;
    const list = [1, 2],
      array = proxy(list);
    list[0] = 7;
    list.push(3);
    const arrayBefore = [array.length, array[0], array[2], Object.keys(array)];
    list[0] = 8;
    list.length = 1;
    const arrayAfter = [array.length, array[0], array[2], Object.keys(array)];
    array.push(9);
    return {
      initialKeys,
      first,
      captured,
      externalKeys,
      next,
      retainedKeys,
      retained,
      missing,
      future,
      raw,
      arrayBefore,
      arrayAfter,
      arrayFinal: [...array],
      list,
    };
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
      `import {proxy} from ${JSON.stringify(proxyFile)};console.log(JSON.stringify((${exercise.toString()})(proxy)));`,
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
  expect(JSON.stringify(exercise((value) => createState(value).value))).toBe(
    JSON.stringify(JSON.parse(output)),
  );
});

test("inherited names become enumerable own overlay data without changing prototypes", () => {
  for (const key of ["toString", "valueOf", "constructor", "__proto__"]) {
    const raw = {},
      value = createState<Record<string, unknown>>(raw).value;
    value[key] = "own";
    expect(value[key]).toBe("own");
    expect(Object.keys(value)).toEqual([key]);
    expect(Object.hasOwn(value, key)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(value, key)).toEqual({
      value: "own",
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.keys(raw)).toEqual([]);
    delete value[key];
    expect(Object.keys(value)).toEqual([]);
    expect(Object.hasOwn(value, key)).toBe(false);
    expect(key in value).toBe(false);
    expect(value[key]).toBe(undefined);
    value[key] = "again";
    expect(Object.keys(value)).toEqual([key]);
  }
});

test("inherited-name own-data behavior deliberately differs from installed Svelte", async () => {
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
      `import {proxy} from ${JSON.stringify(proxyFile)}; const value=proxy({}); value.toString='own'; const initial={keys:Object.keys(value),own:Object.hasOwn(value,'toString'),type:typeof value.toString};delete value.toString;value.toString='again';console.log(JSON.stringify({initial,after:{keys:Object.keys(value),own:Object.hasOwn(value,'toString'),value:value.toString}}));`,
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
    initial: { keys: [], own: false, type: "function" },
    after: { keys: [], own: true, value: "again" },
  });
  const value = createState<Record<string, unknown>>({}).value;
  Reflect.set(value, "toString", "own");
  expect({
    keys: Object.keys(value),
    own: Object.hasOwn(value, "toString"),
    value: Reflect.get(value, "toString") as unknown,
  }).toEqual({ keys: ["toString"], own: true, value: "own" });
});

test("snapshot cloneables, shallow collections, toJSON cycles and uncloneables match Svelte", async () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- exact probe serialized into installed reference subprocess.
  function exercise(snapshot: (value: any) => any) {
    const entry = { count: 1 },
      map = new Map([["entry", entry]]),
      set = new Set([entry]);
    const date = new Date("2020-01-02T00:00:00Z"),
      bytes = new Uint8Array([1, 2]);
    const buffer = bytes.buffer,
      fn = () => entry.count,
      weak = new WeakMap(),
      symbol = Symbol("value");
    const event = new EventTarget();
    class JsonCycle {
      toJSON() {
        return { owner: this, label: "json" };
      }
    }
    const json = new JsonCycle();
    const sparse: any[] = [];
    sparse.length = 3;
    sparse[1] = undefined;
    (sparse as any).extra = 4;
    const plain: any = {
      count: 1,
      toJSON() {
        return "ignored";
      },
      [symbol]: 3,
    };
    Object.defineProperty(plain, "hidden", { value: 4 });
    let getters = 0;
    Object.defineProperty(plain, "getter", {
      enumerable: true,
      get() {
        getters++;
        return 5;
      },
    });
    const input = {
      map,
      mapAgain: map,
      set,
      date,
      bytes,
      buffer,
      fn,
      weak,
      event,
      json,
      jsonAgain: json,
      sparse,
      plain,
    };
    const output = snapshot(input);
    const marker = "__moonshine_snapshot_inherited__";
    let inherited: any;
    // oxlint-disable-next-line eslint/no-extend-native -- bounded inherited-enumerable snapshot reference case, restored in finally.
    Object.defineProperty(Object.prototype, marker, {
      value: 7,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    try {
      inherited = snapshot({ own: 1 });
    } finally {
      Reflect.deleteProperty(Object.prototype, marker);
    }
    return {
      mapNew: output.map !== map,
      mapAlias: output.map === output.mapAgain,
      mapEntry: output.map.get("entry") === entry,
      setNew: output.set !== set,
      setEntry: output.set.has(entry),
      dateNew: output.date !== date,
      date: output.date.toISOString(),
      bytesNew: output.bytes !== bytes,
      bytesBufferNew: output.bytes.buffer !== bytes.buffer,
      bytes: [...output.bytes],
      bufferNew: output.buffer !== buffer,
      fn: output.fn === fn,
      weak: output.weak === weak,
      event: output.event === event,
      jsonCycle: output.json.owner === output.json,
      jsonAlias: output.json === output.jsonAgain,
      jsonLabel: output.json.label,
      sparse: [
        output.sparse.length,
        0 in output.sparse,
        1 in output.sparse,
        2 in output.sparse,
        Object.hasOwn(output.sparse, "extra"),
      ],
      plainKeys: Reflect.ownKeys(output.plain).map(String),
      getter: output.plain.getter,
      getters,
      toJSONRetained: output.plain.toJSON === plain.toJSON,
      inherited: [Object.hasOwn(inherited, marker), inherited[marker]],
    };
  }
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const cloneFile = new URL("./src/internal/shared/clone.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import {snapshot} from ${JSON.stringify(cloneFile)};console.log(JSON.stringify((${exercise.toString()})(value=>snapshot(value,true))));`,
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
  expect(JSON.parse(JSON.stringify(exercise(stateSnapshot)))).toEqual(
    JSON.parse(output),
  );
});

test("snapshot terminates implicit raw cycles while preserving explicit proxy overrides", () => {
  const raw: any = { count: 1 };
  raw.self = raw;
  const state = createState(raw);
  state.value.count = 2;
  const child = state.value.self;
  child.count = 3;
  const output = stateSnapshot(state.value);
  expect(output.count).toBe(2);
  expect(output.self.count).toBe(3);
  expect(output.self.self).toBe(output.self);
  expect(output.self).not.toBe(output);
  expect(raw.count).toBe(1);
});

test("snapshot is untracked and returns detached native state values", () => {
  const state = createState({ count: 1 });
  let calls = 0;
  createRoot((stop) => {
    createComputed(() => {
      calls++;
      stateSnapshot(state.value);
    });
    state.value.count = 2;
    expect(calls).toBe(1); // Reading the state cell is tracked; its deep fields are not.
    state.value = { count: 3 };
    expect(calls).toBe(2);
    stop();
  });
});

test("snapshot preserves thrown serializer failures and bounds self-returning serializers", () => {
  const failure = new Error("serialize");
  class Throws {
    toJSON() {
      throw failure;
    }
  }
  expect(() => stateSnapshot(new Throws())).toThrow(failure);
  class Self {
    toJSON() {
      return this;
    }
  }
  const self = new Self();
  expect(stateSnapshot(self)).toBe(self);
});

test("initialized signed zero retains its value while NaN writes notify and array length follows source equality", () => {
  const value = createState({ number: 0, array: [0] });
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    createComputed(() => {
      seen.push(value.value.number);
    });
    return dispose;
  });
  value.value.number = -0;
  expect(Object.is(value.value.number, 0)).toBe(true);
  expect(seen).toEqual([0]);
  value.value.number = NaN;
  value.value.number = NaN;
  expect(seen).toHaveLength(3);
  value.value.array.length = -0;
  expect(Object.is(value.value.array.length, -0)).toBe(true);
  value.value.array.length = 0;
  expect(Object.is(value.value.array.length, -0)).toBe(true);
  const empty = createState<number[]>([]);
  empty.value.length = -0;
  expect(Object.is(empty.value.length, -0)).toBe(false);
  expect(0 in value.value.array).toBe(false);
  stop();
});
