import { afterEach, expect, spyOn, test } from "bun:test";
import {
  componentRef,
  exposeComponent,
  flushComponentReferences,
  type ComponentReference,
} from "../src/component-instance";
import { createComponent } from "../src/component";
import {
  createRoot,
  createSignal,
  onCleanup,
  getOwner,
  runWithOwner,
  type Owner,
} from "../src/reactive";
import { h, render } from "../src/dom";
import { Index } from "../src/control";
import { h as serverH, renderToString } from "../src/ssr";
import { createState } from "../../adapter-svelte/src/state";
import "../../react/test/dom";
let dispose = () => {};

test("instance construction rejects values whose callable or inherited API would be lost", () => {
  class Inherited {
    method() {
      return 1;
    }
  }
  createRoot((stop) => {
    createComponent(
      () => {
        for (const value of [() => 1, [1], new Inherited()])
          expect(() => exposeComponent(value)).toThrow(
            "plain object of named exports",
          );
        expect(exposeComponent({ method: () => 1 }).method()).toBe(1);
      },
      {},
      "dom",
    );
    stop();
  });
});
afterEach(() => {
  dispose();
  dispose = () => {};
  document.body.replaceChildren();
});

test("opaque exports preserve methods/getters and reference microtask timing", async () => {
  const [value, setValue] = createSignal(1);
  const exports = {
    get count() {
      return value();
    },
    increment() {
      setValue(this.count + 1);
    },
  };
  let instance!: typeof exports;
  const state = createState<typeof exports | null | undefined>(undefined);
  const binding: ComponentReference<typeof exports> = {
    get: () => state.value,
    set: (next) => {
      state.value = next;
    },
  };
  const container = document.createElement("main");
  document.body.append(container);
  let setups = 0;
  dispose = render(
    () =>
      h(
        () => {
          setups++;
          instance = exposeComponent(exports);
          expect(state.value).toBeUndefined();
          return h("p", null, () => value());
        },
        { [componentRef]: binding },
      ),
    container,
  );
  expect(state.value).toBeUndefined();
  expect(instance).not.toBe(exports);
  await Promise.resolve();
  expect(state.value).toBe(instance);
  expect(Object.getOwnPropertyDescriptor(instance, "count")?.get).toBe(
    Object.getOwnPropertyDescriptor(exports, "count")?.get,
  );
  state.value!.increment();
  expect(container.textContent).toBe("2");
  expect(setups).toBe(1);
  dispose();
  expect(state.value).toBe(instance);
  await Promise.resolve();
  expect(state.value).toBeNull();
});

test("old owner cleanup cannot clear a replacement instance reference", async () => {
  let current: object | null | undefined;
  const reference = {
    get: () => current,
    set: (value: object | null) => {
      current = value;
    },
  };
  let firstStop = () => {},
    secondStop = () => {};
  let first!: object, second!: object;
  createRoot((stop) => {
    firstStop = stop;
    first = createComponent(
      () => exposeComponent({}),
      { [componentRef]: reference },
      "dom",
    );
  });
  await Promise.resolve();
  expect(current).toBe(first);
  createRoot((stop) => {
    secondStop = stop;
    second = createComponent(
      () => exposeComponent({}),
      { [componentRef]: reference },
      "dom",
    );
  });
  await Promise.resolve();
  expect(current).toBe(second);
  firstStop();
  await Promise.resolve();
  expect(current).toBe(second);
  secondStop();
  expect(current).toBe(second);
  await Promise.resolve();
  expect(current).toBeNull();
});

test("failed setup or early disposal cancels publication and exports require setup", async () => {
  let writes = 0;
  const reference = {
    get: () => undefined,
    set: () => {
      writes++;
    },
  };
  expect(() =>
    createRoot(() =>
      createComponent(
        () => {
          exposeComponent({});
          throw new Error("setup failure");
        },
        { [componentRef]: reference },
        "dom",
      ),
    ),
  ).toThrow("setup failure");
  createRoot((stop) => {
    createComponent(
      () => exposeComponent({}),
      { [componentRef]: reference },
      "dom",
    );
    stop();
  });
  await Promise.resolve();
  expect(writes).toBe(0);
  expect(() => exposeComponent({})).toThrow("component initialization");
  expect(() =>
    createRoot(() =>
      createComponent(
        () => {
          exposeComponent({});
          exposeComponent({});
        },
        {},
        "dom",
      ),
    ),
  ).toThrow("only once");
  expect(() =>
    createRoot(() =>
      createComponent(() => exposeComponent({}), { [componentRef]: {} }, "dom"),
    ),
  ).toThrow("get and set");
});

test("publication exceptions roll back their reference and retain the original error", () => {
  const queued: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => {
    queued.push(fn);
  });
  let current: object | null | undefined;
  const original = new Error("publish failed");
  let stop = () => {};
  try {
    createRoot((disposeRoot) => {
      stop = disposeRoot;
      createComponent(
        () => exposeComponent({}),
        {
          [componentRef]: {
            get: () => current,
            set: (next: object | null) => {
              current = next;
              if (next !== null) throw original;
            },
          },
        },
        "dom",
      );
    });
    expect(() => queued.shift()!()).toThrow(original);
    expect(current).toBeNull();
    stop();
    queued.shift()?.();
  } finally {
    stop();
    spy.mockRestore();
  }
});

test("SSR exposes descriptors without reading or scheduling references", async () => {
  const exports = { method: () => 1 };
  let instance!: typeof exports;
  expect(
    renderToString(() =>
      serverH(
        () => {
          instance = exposeComponent(exports);
          return serverH("p", null, "server");
        },
        {
          get [componentRef]() {
            throw new Error("SSR binding getter");
          },
        },
      ),
    ),
  ).toBe("<p>server</p>");
  expect(instance).not.toBe(exports);
  expect(instance.method()).toBe(1);
  expect(Object.getOwnPropertyDescriptor(instance, "method")).toEqual(
    Object.getOwnPropertyDescriptor(exports, "method"),
  );
  await Promise.resolve();
});

test("explicit reference phase waits for setup then drains peers despite a publisher failure", () => {
  const jobs: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => {
    jobs.push(fn);
  });
  const failure = new Error("first publisher");
  let first: object | null | undefined, second: object | null | undefined;
  let stop = () => {};
  try {
    createRoot((disposeRoot) => {
      stop = disposeRoot;
      createComponent(
        () => {
          exposeComponent({ name: "first" });
          flushComponentReferences();
          expect(first).toBeUndefined();
        },
        {
          [componentRef]: {
            get: () => first,
            set: (value: object | null) => {
              first = value;
              if (value) throw failure;
            },
          },
        },
        "dom",
      );
      createComponent(
        () => exposeComponent({ name: "second" }),
        {
          [componentRef]: {
            get: () => second,
            set: (value: object | null) => {
              second = value;
            },
          },
        },
        "dom",
      );
    });
    expect(jobs).toHaveLength(1);
    expect(() => flushComponentReferences()).toThrow(failure);
    expect(first).toBeNull();
    expect(second).toEqual({ name: "second" });
    expect(() => jobs.shift()!()).not.toThrow();
    stop();
    while (jobs.length) jobs.shift()!();
    expect(second).toBeNull();
  } finally {
    stop();
    while (jobs.length) jobs.shift()!();
    spy.mockRestore();
  }
});

test("retained Index instances move captured reference paths without recreating setup", async () => {
  const [rows, setRows] = createSignal(["a", "b"]);
  const cells: Record<string, object | null> = {};
  let setups = 0;
  const container = document.createElement("main");
  document.body.append(container);
  dispose = render(
    () =>
      Index({
        each: rows,
        children: (item) =>
          h(
            () => {
              setups++;
              exposeComponent({
                get name() {
                  return item();
                },
              });
              return h("button", null, item);
            },
            {
              [componentRef]: {
                parts: () => [item()],
                get: (key: string) => cells[key],
                set: (value: object | null, key: string) => {
                  cells[key] = value;
                },
              },
            },
          ),
      }),
    container,
  );
  await Promise.resolve();
  const first = cells.a,
    second = cells.b;
  const nodes = Array.from(container.querySelectorAll("button"));
  setRows(["b", "a"]);
  await Promise.resolve();
  expect(cells.b).toBe(first);
  expect(cells.a).toBe(second);
  expect(setups).toBe(2);
  expect(Array.from(container.querySelectorAll("button"))).toEqual(nodes);
  dispose();
  await Promise.resolve();
  expect(cells).toEqual({ a: null, b: null });
});

test("typed path tuples initialize after setup and do not track cell access", async () => {
  const [key, setKey] = createSignal("a"),
    [unrelated, setUnrelated] = createSignal(0);
  const cells: Record<string, Record<number, object | null>> = { a: {}, b: {} };
  let partsReads = 0,
    writes = 0;
  let instance!: object;
  let late!: number;
  const reference: ComponentReference<
    object,
    readonly [key: string, index: number]
  > = {
    parts: () => {
      partsReads++;
      if (late === undefined) throw new Error("early parts");
      return [key(), late] as const;
    },
    get: (name, index) => {
      unrelated();
      return cells[name]![index];
    },
    set: (value, name, index) => {
      unrelated();
      writes++;
      cells[name]![index] = value;
    },
  };
  createRoot((stop) => {
    dispose = stop;
    createComponent(
      () => {
        instance = exposeComponent({ method: () => 1 });
        expect(partsReads).toBe(0);
        late = 2;
      },
      { [componentRef]: reference },
      "dom",
    );
  });
  await Promise.resolve();
  expect(cells.a![2]).toBe(instance);
  expect(partsReads).toBe(1);
  expect(writes).toBe(1);
  setUnrelated(1);
  await Promise.resolve();
  expect(partsReads).toBe(1);
  expect(writes).toBe(1);
  setKey("b");
  await Promise.resolve();
  expect(cells.a![2]).toBeNull();
  expect(cells.b![2]).toBe(instance);
  expect(partsReads).toBe(2);
  dispose();
  await Promise.resolve();
  expect(cells.b![2]).toBeNull();
});

test("captured tuple snapshots survive mutable metadata buffers and replacement cleanup", async () => {
  const [key, setKey] = createSignal("a");
  const buffer = ["a"];
  const cells: Record<string, object | null> = {};
  let instance!: object;
  createRoot((stop) => {
    dispose = stop;
    instance = createComponent(
      () => exposeComponent({}),
      {
        [componentRef]: {
          parts: () => {
            buffer[0] = key();
            return buffer;
          },
          get: (name: string) => cells[name],
          set: (value: object | null, name: string) => {
            cells[name] = value;
          },
        },
      },
      "dom",
    );
  });
  await Promise.resolve();
  setKey("b");
  await Promise.resolve();
  expect(cells.a).toBeNull();
  expect(cells.b).toBe(instance);
  const replacement = { name: "replacement" };
  cells.b = replacement;
  dispose();
  await Promise.resolve();
  expect(cells.b).toBe(replacement);
});

test("queued path changes cancel before publication and cleanup targets the last published path", async () => {
  const [key, setKey] = createSignal("a");
  const cells: Record<string, object | null> = {};
  const writes: string[] = [];
  createRoot((stop) => {
    dispose = stop;
    createComponent(
      () => exposeComponent({}),
      {
        [componentRef]: {
          parts: () => [key()],
          get: (name: string) => cells[name],
          set: (value: object | null, name: string) => {
            writes.push(name);
            cells[name] = value;
          },
        },
      },
      "dom",
    );
  });
  await Promise.resolve();
  setKey("b");
  dispose();
  await Promise.resolve();
  expect(cells.a).toBeNull();
  expect(cells.b).toBeUndefined();
  expect(writes).toEqual(["a", "a"]);
});

test("failed path publication rolls back new cells, preserves prior path and drains peers", () => {
  const jobs: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => {
    jobs.push(fn);
  });
  const cells: Record<string, object | null> = {};
  const [key, setKey] = createSignal("a");
  const failure = new Error("path setter");
  let peer: object | null | undefined;
  try {
    createRoot((stop) => {
      dispose = stop;
      createComponent(
        () => exposeComponent({}),
        {
          [componentRef]: {
            parts: () => [key()],
            get: (name: string) => cells[name],
            set: (value: object | null, name: string) => {
              cells[name] = value;
              if (name === "b") throw value ? failure : new Error("rollback");
            },
          },
        },
        "dom",
      );
    });
    flushComponentReferences();
    const first = cells.a;
    setKey("b");
    createRoot((stop) => {
      const previous = dispose;
      dispose = () => {
        previous();
        stop();
      };
      createComponent(
        () => exposeComponent({ peer: true }),
        {
          [componentRef]: {
            parts: () => [0],
            get: () => peer,
            set: (value: object | null) => {
              peer = value;
            },
          },
        },
        "dom",
      );
    });
    expect(() => flushComponentReferences()).toThrow(failure);
    expect(cells.a).toBe(first);
    expect(cells.b).toBeNull();
    expect(peer).toEqual({ peer: true });
    setKey("c");
    expect(() => flushComponentReferences()).not.toThrow();
    expect(cells.c).toBe(first);
    expect(cells.a).toBeNull();
  } finally {
    dispose();
    while (jobs.length) jobs.shift()!();
    spy.mockRestore();
  }
});

test("setter-triggered disposal clears both old and newly published paths", async () => {
  const [key, setKey] = createSignal("a");
  const cells: Record<string, object | null> = {};
  createRoot((stop) => {
    dispose = stop;
    createComponent(
      () => exposeComponent({}),
      {
        [componentRef]: {
          parts: () => [key()],
          get: (name: string) => cells[name],
          set: (value: object | null, name: string) => {
            cells[name] = value;
            if (value && name === "b") stop();
          },
        },
      },
      "dom",
    );
  });
  await Promise.resolve();
  setKey("b");
  await Promise.resolve();
  await Promise.resolve();
  expect(cells).toEqual({ a: null, b: null });
});

test("SSR never reads dynamic reference descriptors or path callbacks", () => {
  expect(
    renderToString(() =>
      serverH(
        () => {
          exposeComponent({});
          return serverH("p", null, "server");
        },
        {
          [componentRef]: {
            get parts() {
              throw new Error("SSR parts");
            },
            get() {
              throw new Error("SSR get");
            },
            set() {
              throw new Error("SSR set");
            },
          },
        },
      ),
    ),
  ).toBe("<p>server</p>");
});

test("runaway path publishers stop individually, drain peers and recover in a future flush", () => {
  const jobs: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation((fn) =>
    jobs.push(fn),
  );
  const [key, setKey] = createSignal(0);
  const cells: Record<number, object | null> = {};
  let looping = true,
    peer: object | null | undefined;
  try {
    createRoot((stop) => {
      dispose = stop;
      createComponent(
        () => exposeComponent({}),
        {
          [componentRef]: {
            parts: () => [key()],
            get: (index: number) => cells[index],
            set: (value: object | null, index: number) => {
              cells[index] = value;
              if (value && looping) setKey(index + 1);
            },
          },
        },
        "dom",
      );
      createComponent(
        () => exposeComponent({ peer: true }),
        {
          [componentRef]: {
            get: () => peer,
            set: (value: object | null) => {
              peer = value;
            },
          },
        },
        "dom",
      );
    });
    expect(() => flushComponentReferences()).toThrow("reference update limit");
    expect(peer).toEqual({ peer: true });
    looping = false;
    setKey(-1);
    expect(() => flushComponentReferences()).not.toThrow();
    expect(cells[-1]).toBeDefined();
  } finally {
    dispose();
    while (jobs.length) jobs.shift()!();
    spy.mockRestore();
  }
});

test("independent large reference cohorts are not capped by feedback waves", () => {
  let published = 0;
  createRoot((stop) => {
    dispose = stop;
    for (let index = 0; index < 1500; index++)
      createComponent(
        () => exposeComponent({ index }),
        {
          [componentRef]: {
            parts: () => [index],
            get: () => undefined,
            set: (value: object | null) => {
              if (value) published++;
            },
          },
        },
        "dom",
      );
  });
  expect(() => flushComponentReferences()).not.toThrow();
  expect(published).toBe(1500);
});

test("aliased path tuples preserve the shared actual cell without clearing the new target", async () => {
  const [key, setKey] = createSignal(0);
  let current: object | null | undefined,
    instance!: object,
    writes = 0;
  createRoot((stop) => {
    dispose = stop;
    instance = createComponent(
      () => exposeComponent({}),
      {
        [componentRef]: {
          parts: () => [key()],
          get: () => current,
          set: (value: object | null) => {
            writes++;
            current = value;
          },
        },
      },
      "dom",
    );
  });
  await Promise.resolve();
  setKey(1);
  await Promise.resolve();
  expect(current).toBe(instance);
  expect(writes).toBe(1);
  dispose();
  await Promise.resolve();
  expect(current).toBeNull();
  expect(writes).toBe(2);
});
test("unchanged tuple reruns restore an externally cleared cell and target getter failures preserve prior publication", () => {
  const [key, setKey] = createSignal("a"),
    [revision, setRevision] = createSignal(0);
  const cells: Record<string, object | null> = {};
  const failure = new Error("target getter");
  let instance!: object;
  createRoot((stop) => {
    dispose = stop;
    instance = createComponent(
      () => exposeComponent({}),
      {
        [componentRef]: {
          parts: () => {
            revision();
            return [key()];
          },
          get: (name: string) => {
            if (name === "b") throw failure;
            return cells[name];
          },
          set: (value: object | null, name: string) => {
            cells[name] = value;
          },
        },
      },
      "dom",
    );
  });
  flushComponentReferences();
  cells.a = null;
  setRevision(1);
  flushComponentReferences();
  expect(cells.a).toBe(instance);
  setKey("b");
  expect(() => flushComponentReferences()).toThrow(failure);
  expect(cells.a).toBe(instance);
  expect(cells.b).toBeUndefined();
  setKey("c");
  flushComponentReferences();
  expect(cells.a).toBeNull();
  expect(cells.c).toBe(instance);
});

test("commit references remain live during child and parent cleanup and clear before stop returns", () => {
  let cell: { kind: string } | null | undefined;
  const seen: unknown[] = [];
  const container = document.createElement("div");
  document.body.append(container);
  const Child = () => {
    exposeComponent({ kind: "child" });
    onCleanup(() => seen.push(["child", cell?.kind, container.textContent]));
    return h("i", null, "child");
  };
  dispose = render(
    () =>
      h(() => {
        onCleanup(() => seen.push(["parent", cell?.kind]));
        return h(Child, {
          [componentRef]: {
            cleanup: "commit",
            get: () => cell,
            set: (value: typeof cell) => {
              cell = value;
            },
          },
        });
      }, {}),
    container,
  );
  flushComponentReferences();
  expect(cell?.kind).toBe("child");
  dispose();
  expect(seen).toEqual([
    ["child", "child", "child"],
    ["parent", "child"],
  ]);
  expect(cell).toBeNull();
  expect(container.textContent).toBe("");
});

test("commit path cleanup drains throwing peers and preserves replacement identity", () => {
  const cells: Record<string, object | null> = {};
  const failure = new Error("clear failed");
  dispose = createRoot((stop) => {
    for (const key of ["a", "b", "replacement"])
      createComponent(
        () => {
          exposeComponent({ key });
          return null;
        },
        {
          [componentRef]: {
            cleanup: "commit",
            parts: () => [key],
            get: (path: string) => cells[path],
            set: (value: object | null, path: string) => {
              cells[path] = value;
              if (path === "a" && value === null) throw failure;
            },
          },
        },
        "dom",
      );
    return stop;
  });
  flushComponentReferences();
  const replacement = {};
  cells.replacement = replacement;
  expect(() => dispose()).toThrow(failure);
  expect(cells).toEqual({ a: null, b: null, replacement });
});

test("commit references canceled before publication never touch the target", () => {
  const writes: unknown[] = [];
  dispose = createRoot((stop) => {
    createComponent(
      () => exposeComponent({}),
      {
        [componentRef]: {
          cleanup: "commit",
          get: () => undefined,
          set: (value: unknown) => writes.push(value),
        },
      },
      "dom",
    );
    return stop;
  });
  dispose();
  flushComponentReferences();
  expect(writes).toEqual([]);
});

test("commit path publication drains setter disposal before returning, after ancestor cleanup", () => {
  for (const writeAfterStop of [false, true]) {
    const cells: Record<string, object | null> = {};
    const seen: unknown[] = [];
    dispose = createRoot((stop) => {
      createComponent(
        () => {
          exposeComponent({});
          onCleanup(() => seen.push(["child", cells.a !== null]));
          return null;
        },
        {
          [componentRef]: {
            cleanup: "commit",
            parts: () => ["a"],
            get: (key: string) => cells[key],
            set: (value: object | null, key: string) => {
              if (value && writeAfterStop) stop();
              cells[key] = value;
              if (value && !writeAfterStop) stop();
            },
          },
        },
        "dom",
      );
      onCleanup(() => seen.push(["parent", cells.a !== null]));
      return stop;
    });
    flushComponentReferences();
    expect(seen).toEqual([
      ["child", true],
      ["parent", true],
    ]);
    expect(cells.a).toBeNull();
  }
});

test("commit fixed publication clears writes made after setter-triggered disposal", () => {
  let cell: object | null | undefined;
  const seen: unknown[] = [];
  dispose = createRoot((stop) => {
    createComponent(
      () => {
        exposeComponent({});
        onCleanup(() => seen.push(cell));
        return null;
      },
      {
        [componentRef]: {
          cleanup: "commit",
          get: () => cell,
          set: (value: object | null) => {
            if (value) stop();
            cell = value;
          },
        },
      },
      "dom",
    );
    return stop;
  });
  flushComponentReferences();
  expect(seen).toEqual([undefined]);
  expect(cell).toBeNull();
});

test("fresh component reference feedback is bounded while initial peer runs", () => {
  const tasks: Array<() => void> = [];
  const microtask = spyOn(globalThis, "queueMicrotask").mockImplementation(
    (fn) => tasks.push(fn),
  );
  let stop!: () => void,
    parent!: Owner,
    count = 0,
    peer = 0;
  const next = () =>
    runWithOwner(parent, () => {
      let current: object | null = null;
      createComponent(
        () => exposeComponent({}),
        {
          [componentRef]: {
            get: () => current,
            set: (value: object | null) => {
              current = value;
              if (value && ++count < 2005) next();
            },
          },
        },
        "dom",
      );
    });
  try {
    createRoot((disposeRoot) => {
      stop = disposeRoot;
      parent = getOwner()!;
      next();
      let current: object | null = null;
      createComponent(
        () => exposeComponent({}),
        {
          [componentRef]: {
            get: () => current,
            set: (value: object | null) => {
              current = value;
              if (value) peer++;
            },
          },
        },
        "dom",
      );
    });
    expect(() => flushComponentReferences()).toThrow("reference update limit");
    expect(peer).toBe(1);
    expect(count).toBe(1000);
    let recovered: object | null = null;
    runWithOwner(parent, () =>
      createComponent(
        () => exposeComponent({ recovered: true }),
        {
          [componentRef]: {
            get: () => recovered,
            set: (value: object | null) => {
              recovered = value;
            },
          },
        },
        "dom",
      ),
    );
    expect(() => flushComponentReferences()).not.toThrow();
    expect(recovered).toEqual({ recovered: true });
  } finally {
    stop();
    while (tasks.length) tasks.shift()!();
    microtask.mockRestore();
  }
});
