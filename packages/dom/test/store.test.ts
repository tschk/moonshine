import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createMutable, createStore, produce, reconcile } from "../src/store";
import { createComputed, createRoot, onCleanup } from "../src/reactive";

// Force Solid's browser reactive graph even when this suite runs under Bun.
let reference: ReturnType<typeof loadSolid> | undefined;
function solid() {
  return (reference ??= loadSolid());
}
async function loadSolid() {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-store-reference-"));
  try {
    const input = join(dir, "reference.ts");
    await writeFile(
      input,
      `export {createRoot,createComputed} from "solid-js"; export {createStore,produce,reconcile} from ${JSON.stringify(resolve(import.meta.dir, "../../../node_modules/solid-js/store/dist/store.js"))};`,
    );
    const result = await Bun.build({
      entrypoints: [input],
      target: "browser",
      plugins: [
        {
          name: "solid-browser",
          setup(build) {
            build.onResolve({ filter: /^solid-js$/ }, () => ({
              path: resolve(
                import.meta.dir,
                "../../../node_modules/solid-js/dist/solid.js",
              ),
            }));
          },
        },
      ],
    });
    if (!result.success) throw new Error(JSON.stringify(result.logs));
    return (await import(
      `data:text/javascript;base64,${Buffer.from(await result.outputs[0]!.text()).toString("base64")}`
    )) as {
      createStore: typeof createStore;
      produce: typeof produce;
      reconcile: typeof reconcile;
      createRoot: typeof createRoot;
      createComputed: typeof createComputed;
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("property, membership and enumeration tracking are independent and ownership disposes", () => {
  const [store, set] = createStore({ a: 1, b: 2 } as {
    a: number;
    b: number;
    optional?: number;
  });
  const counts = [0, 0, 0, 0];
  let dispose!: () => void;
  let cleanup = 0;
  createRoot((stop) => {
    dispose = stop;
    createComputed(() => {
      void store.a;
      counts[0]++;
    });
    createComputed(() => {
      void store.b;
      counts[1]++;
    });
    createComputed(() => {
      void ("optional" in store);
      counts[2]++;
    });
    createComputed(() => {
      Object.keys(store);
      counts[3]++;
    });
    onCleanup(() => cleanup++);
  });
  set("a", 3);
  expect(counts).toEqual([2, 1, 1, 2]);
  set("optional", 1);
  expect(counts).toEqual([2, 1, 2, 3]);
  set("optional", undefined);
  expect(counts).toEqual([2, 1, 3, 4]);
  dispose();
  set("a", 4);
  expect(counts).toEqual([2, 1, 3, 4]);
  expect(cleanup).toBe(1);
});

test("readonly stable nested proxies alias source and nested stores share updates", () => {
  const initial = { user: { name: "Ada" }, items: [1] };
  const [store, set] = createStore(initial);
  expect(store.user).toBe(store.user);
  store.user.name = "ignored";
  store.items.push(2);
  expect(store.user.name).toBe("Ada");
  expect(store.items).toHaveLength(1);
  const [nested, setNested] = createStore(store.user);
  let observed = "";
  const stop = createRoot((dispose) => {
    createComputed(() => {
      observed = store.user.name;
    });
    return dispose;
  });
  expect(nested).toBe(store.user);
  setNested("name", "Grace");
  expect(observed).toBe("Grace");
  expect(initial.user.name).toBe("Grace");
  set("user", { name: "Lin" });
  expect(store.user).toBe(nested);
  stop();
});

test("path selectors, shallow merges, array replacement and produce match Solid", async () => {
  function scenario(api: {
    createStore: typeof createStore;
    produce: typeof produce;
  }) {
    const [state, set] = api.createStore({
      user: { name: "Ada", age: 1 },
      items: [
        { id: 1, n: 0 },
        { id: 2, n: 1 },
        { id: 3, n: 2 },
      ],
      gone: true as boolean | undefined,
    });
    set("user", { name: "Grace" });
    set("items", [0, 2], "n", (n: number) => n + 3);
    set(
      "items",
      (item: { id: number }) => item.id === 2,
      "n",
      (n: number) => n + 5,
    );
    set("items", { from: 0, to: 2, by: 2 }, "n", (n: number) => n * 2);
    set("gone", undefined);
    set(
      api.produce<typeof state>((draft) => {
        draft.items.push({ id: 4, n: 9 });
        draft.items.splice(1, 1);
        delete draft.gone;
      }),
    );
    const [array, setArray] = api.createStore([1, 2, 3]);
    setArray([4]);
    return {
      state: JSON.stringify(state),
      keys: Object.keys(state),
      array: [...array],
    };
  }
  expect(scenario({ createStore, produce })).toEqual(scenario(await solid()));
});

test("setters batch, updaters do not subscribe and draft errors keep graph usable", () => {
  const [state, set] = createStore({ a: 0, b: 0, items: [1, 2, 3] });
  let runs = 0;
  const stop = createRoot((dispose) => {
    createComputed(() => {
      void state.a;
      void state.b;
      runs++;
    });
    return dispose;
  });
  set(
    produce<typeof state>((draft) => {
      draft.a++;
      draft.b++;
    }),
  );
  expect(runs).toBe(2);
  expect(() =>
    set(
      produce<typeof state>((draft) => {
        draft.a++;
        throw new Error("draft error");
      }),
    ),
  ).toThrow("draft error");
  expect(runs).toBe(3);
  set("a", 4);
  expect(runs).toBe(4);
  let length = 0,
    removed: number | undefined,
    present = true;
  const stopArray = createRoot((dispose) => {
    createComputed(() => {
      length = state.items.length;
      removed = state.items[2];
      present = 2 in state.items;
    });
    return dispose;
  });
  set("items", "length", 1);
  expect([length, removed, present]).toEqual([1, undefined, false]);
  stopArray();
  stop();
});

test("reconcile preserves keyed item identity including duplicates and removes stale keys", async () => {
  function scenario(api: {
    createStore: typeof createStore;
    reconcile: typeof reconcile;
  }) {
    const [state, set] = api.createStore({
      items: [
        { id: 1, label: "a", old: true as boolean | undefined },
        { id: 2, label: "b" },
        { id: 1, label: "c" },
      ],
      stale: 1 as number | undefined,
    });
    const previous = [...state.items];
    set(
      api.reconcile({
        items: [
          { id: 1, label: "first" },
          { id: 1, label: "second" },
          { id: 2, label: "last" },
        ],
      } as typeof state),
    );
    return {
      value: JSON.stringify(state),
      identity: state.items.map((item) => previous.indexOf(item)),
      keys: Object.keys(state.items[0]!),
    };
  }
  expect(scenario({ createStore, reconcile })).toEqual(scenario(await solid()));
});

test("reconcile key:null and merge modes match Solid", async () => {
  function scenario(api: {
    createStore: typeof createStore;
    reconcile: typeof reconcile;
  }) {
    const [state, set] = api.createStore({
      items: [{ label: "a" }, { label: "b" }],
    });
    const before = [...state.items];
    set(
      "items",
      api.reconcile([{ label: "x" }, { label: "y" }], {
        key: null,
        merge: true,
      }),
    );
    const mergeIdentity = state.items.map((item) => before.indexOf(item));
    set("items", api.reconcile([{ label: "z" }], { key: null }));
    return {
      mergeIdentity,
      finalIdentity: before.indexOf(state.items[0]!),
      value: JSON.stringify(state),
    };
  }
  expect(scenario({ createStore, reconcile })).toEqual(scenario(await solid()));
});

test("guard invalid paths/ranges and preserve nonwrappable values", () => {
  class Entry {
    value = 1;
  }
  const instance = new Entry();
  const date = new Date(0);
  const [state, set] = createStore({ instance, date, items: [1, 2], value: 1 });
  expect(state.instance).toBe(instance);
  expect(state.date).toBe(date);
  expect(() => set("items", { by: 0 }, 4)).toThrow("positive integer");
  expect(() => set("items", { by: -1 }, 4)).toThrow("positive integer");
  expect(() => set("__proto__", "polluted", true)).toThrow("Unsafe");
  expect(() => set("value", "nested", 2)).toThrow("not an object");
  expect(() => Object.defineProperty(state, "x", { value: 1 })).toThrow(
    "descriptors",
  );
  expect(() => createStore(Object.freeze({ a: 1 }))).toThrow("extensible");
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("getters, cycles, descriptors, functions and updater tracking retain the native contract", () => {
  const initial: {
    count: number;
    readonly twice: number;
    self?: unknown;
    callback: () => number;
  } = {
    count: 1,
    get twice() {
      return this.count * 2;
    },
    callback: () => 4,
  };
  initial.self = initial;
  const [state, set] = createStore(initial);
  expect(state.self).toBe(state);
  expect(Object.getOwnPropertyDescriptor(state, "self")?.get?.()).toBe(state);
  let observed = 0;
  const stop = createRoot((dispose) => {
    createComputed(() => {
      observed = state.twice;
    });
    return dispose;
  });
  set("count", 2);
  expect(observed).toBe(4);
  set("callback", () => () => 8);
  expect(state.callback()).toBe(8);
  let updaterRuns = 0;
  const stopUpdater = createRoot((dispose) => {
    createComputed(() => {
      updaterRuns++;
      set("count", (previous) => previous + 1);
    });
    return dispose;
  });
  set("count", 10);
  expect(updaterRuns).toBe(1);
  expect(observed).toBe(20);
  stopUpdater();
  stop();
});

test("fine-grained reactive observations and disposal match Solid browser stores", async () => {
  function scenario(api: {
    createStore: typeof createStore;
    createRoot: typeof createRoot;
    createComputed: typeof createComputed;
    produce: typeof produce;
  }) {
    const [state, set] = api.createStore({ a: 1, b: 2, items: [1, 2, 3] } as {
      a: number;
      b: number;
      items: number[];
      added?: number;
    });
    const observations: unknown[] = [];
    const stop = api.createRoot((dispose) => {
      api.createComputed(() => {
        observations.push(["a", state.a]);
      });
      api.createComputed(() => {
        observations.push(["b", state.b]);
      });
      api.createComputed(() => {
        observations.push(["has", "added" in state]);
      });
      api.createComputed(() => {
        observations.push(["array", state.items.length, state.items[2]]);
      });
      return dispose;
    });
    set("a", 3);
    set("added", 1);
    set("added", undefined);
    set(
      api.produce<typeof state>((draft) => {
        draft.a = 4;
        draft.b = 5;
      }),
    );
    set("items", "length", 1);
    stop();
    set("a", 10);
    return observations;
  }
  expect(
    scenario({ createStore, createRoot, createComputed, produce }),
  ).toEqual(scenario(await solid()));
});

test("reconcile removes missing own keys even when snapshot inherits their names", async () => {
  function scenario(api: {
    createStore: typeof createStore;
    reconcile: typeof reconcile;
  }) {
    const [state, set] = api.createStore({
      toString: "label",
      hasOwnProperty: "own",
      value: 1,
    });
    set(api.reconcile({ value: 2 } as typeof state));
    return Object.keys(state);
  }
  expect(scenario({ createStore, reconcile })).toEqual(["value"]);
  // Solid1.9.14 retains these stale own keys; native reconciliation uses snapshot own presence.
  expect(scenario(await solid())).toEqual([
    "toString",
    "hasOwnProperty",
    "value",
  ]);
});

test("reconcile supports distinct cyclic structures with fresh pair tracking per invocation", () => {
  type Cyclic = { value: number; self?: Cyclic; nested?: { parent: Cyclic } };
  const previous: Cyclic = { value: 1 };
  previous.self = previous;
  previous.nested = { parent: previous };
  const snapshot: Cyclic = { value: 2 };
  snapshot.self = snapshot;
  snapshot.nested = { parent: snapshot };
  const [state, set] = createStore(previous);
  const nested = state.nested;
  const modifier = reconcile(snapshot);
  set(modifier);
  expect(state.value).toBe(2);
  expect(state.self).toBe(state);
  expect(state.nested).toBe(nested);
  expect(state.nested?.parent).toBe(state);
  set("value", 3);
  set(modifier);
  expect(state.value).toBe(2);
});

test("produce rejects prototype traversal before exposing writable inherited objects", () => {
  const [state, set] = createStore({ nested: { value: 1 } });
  const prototype = Object.prototype as Record<string, unknown>;
  const marker = "moonshineStorePrototypeProbe";
  const previous = Object.getOwnPropertyDescriptor(prototype, marker);
  try {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(() =>
        set(
          produce<typeof state>((draft) => {
            const target = (draft.nested as unknown as Record<string, any>)[
              key
            ];
            target[marker] = true;
          }),
        ),
      ).toThrow("Unsafe store draft access");
      expect(Object.hasOwn(prototype, marker)).toBe(previous !== undefined);
    }
    const [array, setArray] = createStore([1, 2, 3]);
    setArray(
      produce<number[]>((draft) => {
        expect(() => {
          Reflect.get(draft, "constructor").prototype[marker] = true;
        }).toThrow();
        expect(draft.slice(0, 2)).toEqual([1, 2]);
        expect(draft.map((value) => value * 2)).toEqual([2, 4, 6]);
        draft.splice(1, 1);
      }),
    );
    expect([...array]).toEqual([1, 3]);
    expect(state.nested.value).toBe(1);
    set("nested", "value", 2);
    expect(state.nested.value).toBe(2);
  } finally {
    if (previous) Object.defineProperty(prototype, marker, previous);
    else delete prototype[marker];
  }
});

test("reconcile preserves live snapshot aliases across array and object swaps", () => {
  const [state, set] = createStore({
    rows: [{ name: "a" }, { name: "b" }],
    left: { name: "left" },
    right: { name: "right" },
  });
  const [a, b] = state.rows;
  const left = state.left,
    right = state.right;
  set("rows", reconcile([b!, a!]));
  expect(state.rows.map((item) => item.name)).toEqual(["b", "a"]);
  expect(state.rows[0]).toBe(b);
  expect(state.rows[1]).toBe(a);
  set(reconcile({ rows: [b!, a!], left: right, right: left }));
  expect(state.left).toBe(right);
  expect(state.right).toBe(left);
  expect([state.left.name, state.right.name]).toEqual(["right", "left"]);
  set(reconcile({ rows: [b!, a!], left: { name: "updated" }, right }));
  expect(state.left.name).toBe("updated");
  expect(state.right).toBe(right);
  expect(right.name).toBe("right");
});

test("reconcile separates shared previous branches and preserves shared snapshot branches", () => {
  const shared = { x: 0 };
  const [state, set] = createStore({ left: shared, right: shared });
  const first = state.left;
  set(reconcile({ left: { x: 1 }, right: { x: 2 } }));
  expect([state.left.x, state.right.x]).toEqual([1, 2]);
  expect(state.left).toBe(first);
  expect(state.right).not.toBe(first);
  const incoming = { x: 3 };
  set(reconcile({ left: incoming, right: incoming }));
  expect(state.left).toBe(state.right);
  expect(state.left.x).toBe(3);
  const [array, setArray] = createStore([{ x: 0 }, { x: 0 }]);
  const next = { x: 4 };
  setArray(reconcile([next, next]));
  expect(array[0]).toBe(array[1]);
  expect(array[0]?.x).toBe(4);
});

test("accessor setters use draft receivers so dependent data writes notify", () => {
  const [state, set] = createStore({
    value: 1,
    get doubled() {
      return this.value * 2;
    },
    set double(value: number) {
      this.value = value / 2;
    },
  });
  const observations: number[] = [];
  const stop = createRoot((dispose) => {
    createComputed(() => {
      observations.push(state.value);
    });
    return dispose;
  });
  set("double", 8);
  expect(state.value).toBe(4);
  expect(state.doubled).toBe(8);
  expect(observations).toEqual([1, 4]);
  set(
    produce<typeof state>((draft) => {
      draft.double = 10;
    }),
  );
  expect(observations).toEqual([1, 4, 5]);
  stop();
});

test("reconcile maps shared snapshots through unmatched keyed items and replacement branches", () => {
  const [state, set] = createStore({
    item: { id: 1, x: 0 },
    list: [{ id: 2, x: 0 }],
  });
  const shared = { id: 1, x: 1 };
  set(reconcile({ item: shared, list: [shared] }));
  expect(state.item).toBe(state.list[0]);
  set("item", "x", 2);
  expect(state.list[0]?.x).toBe(2);
  expect(shared.x).toBe(1);
  type Tree = {
    list?: Tree[];
    child?: Tree | number;
    parent?: Tree;
    name?: string;
  };
  const [tree, setTree] = createStore<Tree>({
    list: [{ name: "old" }],
    child: 3,
  });
  const snapshot: Tree = { list: [], child: {} };
  snapshot.list!.push(snapshot);
  (snapshot.child as Tree).parent = snapshot;
  setTree(reconcile(snapshot));
  expect(tree.list?.[0]).toBe(tree);
  expect((tree.child as Tree).parent).toBe(tree);
  expect(snapshot.list?.[0]).toBe(snapshot);
  expect((snapshot.child as Tree).parent).toBe(snapshot);
});

test("replacement branches retain incoming identity when no references require remapping", () => {
  const incoming = { nested: { name: "new" } };
  const [state, set] = createStore<{ child: number | typeof incoming }>({
    child: 3,
  });
  set(reconcile({ child: incoming }));
  const [same] = createStore(incoming);
  expect(state.child).toBe(same);
  expect((state.child as typeof incoming).nested).toBe(same.nested);
});

test("mutable equality is opt-in, cached per policy and retained through setter receivers", () => {
  const raw = {
    nested: { value: 0 },
    get value() {
      return this.nested.value;
    },
    set value(next: number) {
      this.nested.value = next;
    },
  };
  const ordinary = createMutable(raw);
  const sameValue = createMutable(raw, { equals: Object.is });
  expect(sameValue).not.toBe(ordinary);
  expect(createMutable(raw, { equals: Object.is })).toBe(sameValue);
  expect(createMutable(sameValue, { equals: Object.is })).toBe(sameValue);
  expect(createMutable(sameValue)).toBe(ordinary);
  const values: number[] = [];
  createRoot((stop) => {
    createComputed(() => values.push(sameValue.value));
    sameValue.value = -0;
    sameValue.value = NaN;
    sameValue.value = NaN;
    expect(values).toEqual([0, -0, NaN]);
    stop();
  });
  const strict = createMutable({ value: 0 });
  const original: number[] = [];
  createRoot((stop) => {
    createComputed(() => original.push(strict.value));
    strict.value = -0;
    expect(Object.is(strict.value, 0)).toBe(true);
    strict.value = NaN;
    strict.value = NaN;
    expect(original).toEqual([0, NaN, NaN]);
    stop();
  });
});

test("createMutable tracks direct nested writes, membership, keys and disposal", () => {
  const token = Symbol("token");
  const initial = { user: { name: "Ada" }, other: 1 } as {
    user: { name: string };
    other: number;
    [token]?: number;
  };
  const state = createMutable(initial);
  const seen: unknown[] = [];
  let unrelated = 0;
  expect(createMutable(state)).toBe(state);
  expect(state.user).toBe(state.user);
  const stop = createRoot((dispose) => {
    createComputed(() =>
      seen.push([
        state.user.name,
        token in state,
        Object.keys(state).join(","),
      ]),
    );
    createComputed(() => {
      void state.other;
      unrelated++;
    });
    return dispose;
  });
  state.user.name = "Grace";
  state[token] = 1;
  delete state[token];
  expect(seen).toEqual([
    ["Ada", false, "user,other"],
    ["Grace", false, "user,other"],
    ["Grace", true, "user,other"],
    ["Grace", false, "user,other"],
  ]);
  expect(unrelated).toBe(1);
  expect(initial.user.name).toBe("Grace");
  stop();
  state.user.name = "Lin";
  expect(seen).toHaveLength(4);
});

test("mutable array methods batch their internal writes and preserve ordinary return values", () => {
  const state = createMutable([1, 2, 3]);
  const seen: number[][] = [];
  const stop = createRoot((dispose) => {
    createComputed(() => seen.push([...state]));
    return dispose;
  });
  expect(state.push(4)).toBe(4);
  expect(seen).toEqual([
    [1, 2, 3],
    [1, 2, 3, 4],
  ]);
  expect(state.splice(1, 2, 8, 9)).toEqual([2, 3]);
  expect(seen.at(-1)).toEqual([1, 8, 9, 4]);
  expect(seen).toHaveLength(3);
  // Exercise the reactive in-place mutator rather than the copying alternative.
  // eslint-disable-next-line unicorn/no-array-reverse
  expect(state.reverse()).toBe(state);
  expect(seen.at(-1)).toEqual([4, 9, 8, 1]);
  expect(state.push).toBe(state.push);
  stop();
});

test("mutable views, readonly stores and produce share raw state without sharing proxy modes", () => {
  const state = createMutable({
    count: 1,
    get doubled() {
      return this.count * 2;
    },
    set double(value: number) {
      this.count = value / 2;
    },
  });
  const [readonly, set] = createStore(state);
  expect(readonly).not.toBe(state);
  expect(createMutable(readonly)).toBe(state);
  const observed: number[] = [];
  let captured: unknown;
  const stop = createRoot((dispose) => {
    createComputed(() => observed.push(state.doubled));
    return dispose;
  });
  state.double = 8;
  expect(observed).toEqual([2, 8]);
  readonly.count = 100;
  expect(state.count).toBe(4);
  set("count", 5);
  expect(observed).toEqual([2, 8, 10]);
  set(
    produce<typeof state>((draft) => {
      captured = draft;
      draft.count = 6;
    }),
  );
  expect(captured).not.toBe(state);
  expect(captured).not.toBe(readonly);
  expect(observed).toEqual([2, 8, 10, 12]);
  stop();
});

test("mutable roots and nested opaque/frozen/prototype boundaries stay explicit", () => {
  class Opaque {
    value = 1;
  }
  const opaque = new Opaque(),
    date = new Date(0);
  const state = createMutable({ opaque, date, nested: { value: 1 } });
  expect(state.opaque).toBe(opaque);
  expect(state.date).toBe(date);
  expect(() => createMutable(date)).toThrow("plain object");
  expect(() => createMutable(Object.freeze({ value: 1 }))).toThrow(
    "extensible",
  );
  expect(() => Reflect.get(state, "__proto__")).toThrow("Unsafe");
  expect(() => Reflect.get(state, "constructor")).toThrow("Unsafe");
  expect(() => Reflect.set(state, "__proto__", {})).toThrow("Unsafe");
  expect(() => Object.defineProperty(state, "value", { value: 1 })).toThrow(
    "descriptors",
  );
  expect(Object.getPrototypeOf({})).toBe(Object.prototype);
});

test("mutable undefined assignment preserves own keys and array slots while delete removes them", () => {
  const state = createMutable<{ optional?: number }>({});
  const observations: unknown[] = [];
  const stop = createRoot((dispose) => {
    createComputed(() =>
      observations.push([
        state.optional,
        "optional" in state,
        Object.keys(state),
      ]),
    );
    return dispose;
  });
  state.optional = undefined;
  expect(Object.hasOwn(state, "optional")).toBe(true);
  expect(observations).toEqual([
    [undefined, false, []],
    [undefined, true, ["optional"]],
  ]);
  delete state.optional;
  expect(Object.hasOwn(state, "optional")).toBe(false);
  expect(observations.at(-1)).toEqual([undefined, false, []]);
  stop();
  const array = createMutable<Array<number | undefined>>([]);
  array[0] = undefined;
  expect(array.length).toBe(1);
  expect(0 in array).toBe(true);
  expect(Object.keys(array)).toEqual(["0"]);
  delete array[0];
  expect(array.length).toBe(1);
  expect(0 in array).toBe(false);
  expect(Object.keys(array)).toEqual([]);
  const [readonly, set] = createStore<{ optional?: number }>({ optional: 1 });
  set("optional", undefined);
  expect(Object.hasOwn(readonly, "optional")).toBe(false);
  set("optional", 2);
  set(
    produce<typeof readonly>((draft) => {
      draft.optional = undefined;
    }),
  );
  expect(Object.hasOwn(readonly, "optional")).toBe(false);
});

test("mutable accessor setters receive undefined and preserve nested assignment semantics", () => {
  const calls: unknown[] = [];
  const state = createMutable({
    backing: 1 as number | undefined,
    get value() {
      return this.backing;
    },
    set value(next: number | undefined) {
      calls.push(next);
      this.backing = next;
    },
  });
  const seen: unknown[] = [];
  const stop = createRoot((dispose) => {
    createComputed(() => seen.push(state.value));
    return dispose;
  });
  state.value = undefined;
  state.value = undefined;
  expect(calls).toEqual([undefined, undefined]);
  expect(Object.hasOwn(state, "value")).toBe(true);
  expect(Object.hasOwn(state, "backing")).toBe(true);
  expect(seen).toEqual([1, undefined]);
  stop();
  expect(() =>
    Reflect.defineProperty(state, "x", {
      value: undefined,
      enumerable: true,
      configurable: true,
      writable: true,
    }),
  ).toThrow("descriptors");
});
