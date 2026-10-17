import { test, expect } from "bun:test";
import {
  createRoot,
  createSignal,
  createRenderEffect,
} from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { withRuneScheduler } from "@tschk/moonshine-svelte/pre";
import { createState } from "@tschk/moonshine-svelte/runes";
import { installAction, installAttachment } from "../src/directives";
function element() {
  return {
    textContent: "0",
    isConnected: true,
    dataset: { n: "0" },
  } as unknown as Element;
}
test("post action factory is untracked and updates in its reserved slot before DOM", async () => {
  const [n, set] = createSignal(0),
    [noise, setNoise] = createSignal(0);
  const node = element();
  let stop!: () => void;
  const trace: unknown[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      installAction(
        node,
        (element, value) => {
          trace.push(["factory", element.textContent, value, noise()]);
          return {
            token: "payload",
            update(value) {
              trace.push([
                "update",
                element.textContent,
                value,
                (this as any).token,
              ]);
            },
            destroy() {
              trace.push(["destroy"]);
            },
          };
        },
        () => {
          trace.push(["param", n()]);
          return n();
        },
      );
      createRenderEffect(() => {
        node.textContent = String(n());
      });
    });
  });
  expect(trace).toEqual([]);
  await Promise.resolve();
  expect(trace).toEqual([
    ["param", 0],
    ["factory", "0", 0, 0],
    ["param", 0],
  ]);
  trace.length = 0;
  set(1);
  set(2);
  await Promise.resolve();
  expect(trace).toEqual([
    ["param", 2],
    ["update", "0", 2, "payload"],
  ]);
  expect(node.textContent).toBe("2");
  trace.length = 0;
  setNoise(1);
  await Promise.resolve();
  expect(trace).toEqual([]);
  stop();
  expect(trace).toEqual([["destroy"]]);
});
test("an action invoker resolves the latest function at initial post time only", async () => {
  const trace: string[] = [];
  let current = () => {
    trace.push("first");
    return {
      destroy() {
        trace.push("destroy-first");
      },
    };
  };
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => installAction(element(), (_node) => current()));
  });
  current = () => {
    trace.push("second");
    return {
      destroy() {
        trace.push("destroy-second");
      },
    };
  };
  await Promise.resolve();
  current = () => {
    trace.push("third");
    return {
      destroy() {
        trace.push("destroy-third");
      },
    };
  };
  await Promise.resolve();
  stop();
  expect(trace).toEqual(["second", "destroy-second"]);
});
test("absence of action parameter never installs an updater and cancellation skips factory", async () => {
  let factories = 0,
    updates = 0;
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      installAction(element(), function () {
        expect(arguments.length).toBe(1);
        factories++;
        return {
          update() {
            updates++;
          },
        };
      }),
    );
  });
  await Promise.resolve();
  stop();
  createRoot((d) => {
    withRuneScheduler(() =>
      installAction(element(), () => {
        factories++;
        return {};
      }),
    );
    d();
  });
  await Promise.resolve();
  expect(factories).toBe(1);
  expect(updates).toBe(0);
});
test("attachments distinguish identity replacement from retained callback dependency reruns", async () => {
  const ns = createState(0),
    ps = createState(false),
    n = () => ns.value,
    set = (value: number) => (ns.value = value),
    picked = () => ps.value,
    pick = (value: boolean) => (ps.value = value);
  const node = element(),
    trace: unknown[] = [];
  let stop!: () => void;
  const first = (element: Element) => {
      trace.push(["first", element.textContent, n()]);
      return () => trace.push(["cleanup-first", element.textContent, n()]);
    },
    second = (element: Element) => {
      trace.push(["second", element.textContent, n()]);
      return () => trace.push(["cleanup-second", element.textContent, n()]);
    };
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      installAttachment(node, () => {
        trace.push(["expression", picked(), n(), node.textContent]);
        return picked() ? second : first;
      });
      createRenderEffect(() => {
        node.textContent = String(n());
      });
    });
  });
  await Promise.resolve();
  trace.length = 0;
  set(2);
  await Promise.resolve();
  expect(trace).toEqual([
    ["expression", false, 2, "0"],
    ["cleanup-first", "2", 0],
    ["first", "2", 2],
  ]);
  trace.length = 0;
  pick(true);
  set(3);
  await Promise.resolve();
  expect(trace).toEqual([
    ["expression", true, 3, "2"],
    ["cleanup-first", "2", 2],
    ["second", "3", 3],
  ]);
  stop();
});
test("SSR suppresses directive read/invoke thunks and DOM requires scheduler ownership", () => {
  let calls = 0;
  createRoot((d) => {
    createComponent(
      () => {
        installAction(
          undefined as any,
          () => {
            calls++;
            return {};
          },
          () => {
            calls++;
            return 1;
          },
        );
        installAttachment(undefined as any, () => {
          calls++;
          return undefined;
        });
      },
      {},
      "ssr",
    );
    d();
  });
  expect(calls).toBe(0);
  expect(() => installAction(element(), () => {})).toThrow("live owner");
  createRoot((d) => {
    expect(() => installAttachment(element(), () => undefined)).toThrow(
      "withRuneScheduler",
    );
    d();
  });
});
test("action parameters track nested native state and separate sibling aliases without mutating raw input", async () => {
  const shared = { v: 0 },
    raw = { left: shared, right: shared, rows: [{ v: 0 }] },
    state = createState(raw);
  const trace: any[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      installAction(
        element(),
        () => ({
          update(value) {
            trace.push([
              value.left.v,
              value.right.v,
              value.rows.length,
              value.rows[0]!.v,
            ]);
          },
        }),
        () => state.value,
      ),
    );
  });
  await Promise.resolve();
  state.value.left.v = 1;
  await Promise.resolve();
  state.value.right.v = 2;
  await Promise.resolve();
  state.value.rows[0]!.v = 3;
  await Promise.resolve();
  state.value.rows.push({ v: 4 });
  await Promise.resolve();
  expect(trace).toEqual([
    [1, 0, 1, 0],
    [1, 2, 1, 0],
    [1, 2, 1, 3],
    [1, 2, 2, 3],
  ]);
  expect(shared.v).toBe(0);
  expect(raw.rows.length).toBe(1);
  stop();
});
test("raw wrapper objects scan their enumerable first level while raw arrays and symbol properties are not traversed", async () => {
  const state = createState({ nested: { v: 0 } }),
    hidden = createState({ v: 0 }),
    sym = Symbol();
  let wrapperUpdates = 0,
    arrayUpdates = 0,
    reads = 0;
  const wrapper = Object.create({ inherited: state.value });
  Object.defineProperty(wrapper, "own", {
    enumerable: true,
    get() {
      reads++;
      return state.value;
    },
  });
  Object.defineProperty(wrapper, "hidden", {
    enumerable: false,
    value: hidden.value,
  });
  wrapper[sym] = hidden.value;
  const array = [state.value];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      installAction(
        element(),
        () => ({
          update() {
            wrapperUpdates++;
          },
        }),
        () => wrapper,
      );
      installAction(
        element(),
        () => ({
          update() {
            arrayUpdates++;
          },
        }),
        () => array,
      );
    });
  });
  await Promise.resolve();
  expect(reads).toBe(1);
  state.value.nested.v = 1;
  await Promise.resolve();
  expect(wrapperUpdates).toBe(1);
  expect(arrayUpdates).toBe(0);
  hidden.value.v = 1;
  await Promise.resolve();
  expect(wrapperUpdates).toBe(1);
  stop();
});
test("deep traversal observes opaque child prototype getters, skips EventTarget and suppresses individual deep getter errors", async () => {
  const source = createState(0);
  let getterReads = 0,
    updates = 0;
  class Child {
    get tracked() {
      getterReads++;
      return source.value;
    }
    get broken() {
      throw Error("ignored");
    }
  }
  const target = new EventTarget();
  Object.defineProperty(target, "bad", {
    enumerable: true,
    get() {
      throw Error("event target must be skipped");
    },
  });
  const state = createState({ child: new Child(), target });
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      installAction(
        element(),
        () => ({
          update() {
            updates++;
          },
        }),
        () => state.value,
      ),
    );
  });
  await Promise.resolve();
  expect(getterReads).toBe(1);
  source.value = 1;
  await Promise.resolve();
  expect(getterReads).toBe(2);
  expect(updates).toBe(1);
  stop();
});
test("action equality skips repeated NaN/primitives but treats objects and functions as changed on invalidation", async () => {
  const tick = createState(0);
  let value: unknown = 0;
  const seen: string[] = [];
  let stop!: () => void;
  const label = (input: unknown) =>
    typeof input === "number"
      ? Number.isNaN(input)
        ? "NaN"
        : Object.is(input, -0)
          ? "-0"
          : String(input)
      : typeof input;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      installAction(
        element(),
        () => ({
          update(next) {
            seen.push(label(next));
          },
        }),
        () => {
          void tick.value;
          return value;
        },
      ),
    );
  });
  await Promise.resolve();
  const invalidate = async (next: unknown) => {
    value = next;
    tick.value++;
    await Promise.resolve();
  };
  await invalidate(0);
  await invalidate(0);
  await invalidate(NaN);
  await invalidate(NaN);
  const object = {};
  await invalidate(object);
  await invalidate(object);
  const fn = () => {};
  await invalidate(fn);
  await invalidate(fn);
  await invalidate(0);
  await invalidate(-0);
  expect(seen).toEqual([
    "0",
    "NaN",
    "object",
    "object",
    "function",
    "function",
    "0",
  ]);
  stop();
});
test("object action updater body reads remain dependencies while initial factory reads stay untracked", async () => {
  const state = createState({ n: 0 }),
    noise = createState(0);
  let factories = 0,
    updates = 0,
    stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      installAction(
        element(),
        () => {
          factories++;
          void noise.value;
          return {
            update() {
              updates++;
              void noise.value;
            },
          };
        },
        () => state.value,
      ),
    );
  });
  await Promise.resolve();
  noise.value = 1;
  await Promise.resolve();
  expect(updates).toBe(0);
  state.value.n = 1;
  await Promise.resolve();
  noise.value = 2;
  await Promise.resolve();
  expect(updates).toBe(2);
  expect(factories).toBe(1);
  stop();
});
test("missing attachments dispose retained callbacks and cancel queued dependency reruns", async () => {
  const n = createState(0),
    enabled = createState(true),
    trace: any[] = [];
  const node = element();
  let stop!: () => void;
  const fn = (element: Element) => {
    trace.push(["attach", element.textContent, n.value]);
    return () => trace.push(["cleanup", element.textContent, n.value]);
  };
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      installAttachment(node, () => (enabled.value ? fn : undefined));
      createRenderEffect(() => (node.textContent = String(n.value)));
    });
  });
  await Promise.resolve();
  trace.length = 0;
  n.value = 1;
  enabled.value = false;
  await Promise.resolve();
  expect(trace).toEqual([["cleanup", "0", 0]]);
  enabled.value = true;
  await Promise.resolve();
  expect(trace).toEqual([
    ["cleanup", "0", 0],
    ["attach", "1", 1],
  ]);
  stop();
});
test("implicit cycles track materialized descendants without read-only invalidation", async () => {
  const raw: any = { foo: 0 };
  raw.self = raw;
  const state = createState(raw);
  const trace: any[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() =>
      installAction(
        element(),
        () => ({
          update(v) {
            trace.push([v.foo, v.self.foo, v.self.self.foo]);
          },
        }),
        () => state.value,
      ),
    );
  });
  await Promise.resolve();
  void state.value.self.self.self;
  await Promise.resolve();
  expect(trace).toEqual([]);
  state.value.self.foo = 1;
  await Promise.resolve();
  state.value.self.self.foo = 2;
  await Promise.resolve();
  expect(trace).toEqual([
    [0, 1, 0],
    [0, 1, 2],
  ]);
  stop();
  state.value.self.self.foo = 3;
  await Promise.resolve();
  expect(trace.length).toBe(2);
  expect(raw.foo).toBe(0);
});
test("native directive cleanup drains peers and preserves first failure", async () => {
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      installAction(element(), () => ({
        destroy() {
          trace.push("action");
          throw Error("first");
        },
      }));
      installAttachment(element(), () => () => () => {
        trace.push("attachment");
        throw Error("second");
      });
    });
  });
  await Promise.resolve();
  expect(stop).toThrow("first");
  expect(trace).toEqual(["action", "attachment"]);
  stop();
});

test("bare and foreign-owner SSR suppress every directive thunk", async () => {
  const { withSSRRendering } = await import("@tschk/moonshine-dom/ssr-owner");
  let calls = 0;
  const invoke = () => {
      calls++;
      return {};
    },
    read = () => {
      calls++;
      return 1;
    };
  withSSRRendering(() => {
    installAction(undefined as any, invoke, read);
    installAttachment(undefined as any, () => {
      calls++;
      return undefined;
    });
    createRoot((stop) => {
      installAction(undefined as any, invoke, read);
      withSSRRendering(() =>
        installAttachment(undefined as any, () => {
          calls++;
          return undefined;
        }),
      );
      stop();
    });
  });
  await Promise.resolve();
  expect(calls).toBe(0);
});
test("cycle interests follow replacement and deletion, detach old aliases and preserve unrelated sibling isolation", async () => {
  const raw: any = { n: 0 };
  raw.self = raw;
  const left = createState(raw),
    right = createState(raw);
  let a = 0,
    b = 0,
    stop!: () => void;
  createRoot((d) => {
    stop = d;
    withRuneScheduler(() => {
      installAction(
        element(),
        () => ({
          update() {
            a++;
          },
        }),
        () => left.value,
      );
      installAction(
        element(),
        () => ({
          update() {
            b++;
          },
        }),
        () => right.value,
      );
    });
  });
  await Promise.resolve();
  const detached = left.value.self;
  left.value.self = { n: 4 };
  await Promise.resolve();
  expect([a, b]).toEqual([1, 0]);
  detached.self.n = 8;
  await Promise.resolve();
  expect([a, b]).toEqual([1, 0]);
  delete left.value.self;
  await Promise.resolve();
  expect([a, b]).toEqual([2, 0]);
  left.value.self = left.value;
  await Promise.resolve();
  expect([a, b]).toEqual([3, 0]);
  left.value.self.n = 9;
  await Promise.resolve();
  expect([a, b]).toEqual([4, 0]);
  stop();
  right.value.self.self.n = 3;
  await Promise.resolve();
  expect([a, b]).toEqual([4, 0]);
});
