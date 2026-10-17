import { createState } from "../src/state";
import {
  holdHistory,
  releaseHistory,
  withHistoryCleanup,
} from "../src/history";
import { expect, test } from "bun:test";
import { createDerived } from "../src/derived";
import {
  createComputed,
  createRoot,
  createSignal,
  batch,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import "../../react/test/dom";

test("derived creation is lazy, caches reads and supports later bindings", () => {
  let calls = 0;
  const derived = createDerived(() => {
    calls++;
    return later * 2;
  });
  expect(calls).toBe(0);
  const later = 3;
  expect(derived.value).toBe(6);
  expect(derived.value).toBe(6);
  expect(calls).toBe(1);
});

test("dependency changes invalidate without evaluating until a read", () => {
  const [source, set] = createSignal(1);
  let calls = 0;
  let value!: ReturnType<typeof createDerived<number>>;
  const stop = createRoot((dispose) => {
    value = createDerived(() => {
      calls++;
      return source() * 2;
    });
    return dispose;
  });
  expect(value.value).toBe(2);
  set(2);
  set(3);
  expect(calls).toBe(1);
  expect(value.value).toBe(6);
  expect(calls).toBe(2);
  stop();
  set(4);
  expect(value.value).toBe(6);
  expect(calls).toBe(2);
  expect(() => {
    value.value = 9;
  }).toThrow("disposed");
});

test("optimistic overrides reset when recalculation equals the previous computed value", () => {
  const [source, set] = createSignal(1);
  const observed: number[] = [];
  let calls = 0;
  const stop = createRoot((dispose) => {
    const value = createDerived(() => {
      calls++;
      return source() % 2;
    });
    createComputed(() => observed.push(value.value));
    value.value = 9;
    expect(observed).toEqual([1, 9]);
    expect(calls).toBe(1);
    set(3);
    expect(observed).toEqual([1, 9, 1]);
    expect(calls).toBe(2);
    set(5);
    expect(observed).toEqual([1, 9, 1]);
    expect(calls).toBe(3);
    return dispose;
  });
  stop();
});

test("derived tracks dynamic branches, batches observers and keeps function overrides literal", () => {
  const [choose, setChoose] = createSignal(true),
    [a, setA] = createSignal(1),
    [b, setB] = createSignal(10);
  const seen: number[] = [];
  let calls = 0;
  const stop = createRoot((dispose) => {
    const value = createDerived(() => {
      calls++;
      return choose() ? a() : b();
    });
    createComputed(() => seen.push(value.value));
    setB(11);
    expect(calls).toBe(1);
    setChoose(false);
    expect(seen).toEqual([1, 11]);
    setA(2);
    expect(calls).toBe(2);
    batch(() => {
      setB(12);
      setB(13);
    });
    expect(seen).toEqual([1, 11, 13]);
    return dispose;
  });
  stop();
  let invoked = 0;
  const original = () => 1,
    override = () => {
      invoked++;
      return 2;
    };
  const fn = createDerived(() => original);
  expect(fn.value).toBe(original);
  fn.value = override;
  expect(fn.value).toBe(override);
  expect(invoked).toBe(0);
});

test("errors retain dependency subscriptions and recover without serving stale cached data", () => {
  const [source, set] = createSignal(1);
  let fail = false;
  const stop = createRoot((dispose) => {
    const value = createDerived(() => {
      const current = source();
      if (fail) throw new Error("derived error");
      return current * 2;
    });
    expect(value.value).toBe(2);
    fail = true;
    set(2);
    expect(() => value.value).toThrow("derived error");
    fail = false;
    set(3);
    expect(value.value).toBe(6);
    return dispose;
  });
  stop();
});

test("DOM dependents update synchronously while equivalent values skip downstream work", () => {
  const [source, set] = createSignal(1);
  let renders = 0;
  const container = document.createElement("main");
  document.body.append(container);
  const stop = render(
    () =>
      h(() => {
        const value = createDerived(() => source() % 2);
        return h("p", null, () => {
          renders++;
          return value.value;
        });
      }, null),
    container,
  );
  expect(container.textContent).toBe("1");
  set(3);
  expect(renders).toBe(1);
  set(4);
  expect(container.textContent).toBe("0");
  expect(renders).toBe(2);
  stop();
  container.remove();
});

test("diamond derived dependents never observe a half-updated graph", () => {
  const [source, set] = createSignal(1);
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    const a = createDerived(() => source() * 2),
      b = createDerived(() => source() * 3),
      total = createDerived(() => a.value + b.value);
    createComputed(() => seen.push(total.value));
    set(2);
    expect(seen).toEqual([5, 10]);
    return dispose;
  });
  stop();
});

test("nested diamonds and overridden siblings pull coherent values", () => {
  const [source, set] = createSignal(1);
  const seen: number[] = [];
  const stop = createRoot((dispose) => {
    const leaf = createDerived(() => source()),
      a = createDerived(() => leaf.value * 2),
      b = createDerived(() => leaf.value * 3),
      total = createDerived(() => a.value + b.value);
    createComputed(() => seen.push(total.value));
    set(2);
    expect(seen).toEqual([5, 10]);
    b.value = 100;
    expect(seen.at(-1)).toBe(104);
    set(3);
    expect(seen.at(-1)).toBe(15);
    expect(seen).not.toContain(106);
    return dispose;
  });
  stop();
});

test("first overrides discover dependencies once and reset on later invalidation", () => {
  const [source, set] = createSignal(1);
  let calls = 0;
  const stop = createRoot((dispose) => {
    const value = createDerived(() => {
      calls++;
      return source() % 2;
    });
    value.value = 9;
    expect(calls).toBe(1);
    expect(value.value).toBe(9);
    expect(calls).toBe(1);
    set(3);
    expect(calls).toBe(1);
    expect(value.value).toBe(1);
    expect(calls).toBe(2);
    return dispose;
  });
  stop();
});

test("lazy reads, writable override resets, dynamic inputs and errors match installed Svelte", async () => {
  type Api = {
    signal: (initial: number) => [() => number, (next: number) => void];
    derived: typeof createDerived;
    root: <T>(run: () => T) => T;
  };
  function exercise(api: Api) {
    return api.root(() => {
      const [source, setSource] = api.signal(1);
      let calls = 0;
      const value = api.derived(() => {
        calls++;
        return source() % 2;
      });
      const before = calls;
      const first = value.value,
        again = value.value;
      const cached = calls;
      value.value = 9;
      const overridden = value.value;
      setSource(3);
      const lazy = calls;
      const reset = value.value;
      const afterReset = calls;
      setSource(5);
      const equal = value.value;
      const [selected, setSelected] = api.signal(1),
        [a, setA] = api.signal(2),
        [b, setB] = api.signal(10);
      let dynamicCalls = 0;
      const dynamic = api.derived(() => {
        dynamicCalls++;
        return selected() ? a() : b();
      });
      const dynamicValues = [dynamic.value];
      setB(11);
      dynamicValues.push(dynamic.value);
      setSelected(0);
      dynamicValues.push(dynamic.value);
      setA(3);
      dynamicValues.push(dynamic.value);
      setB(12);
      dynamicValues.push(dynamic.value);
      let fail = false;
      const [input, setInput] = api.signal(1);
      const failing = api.derived(() => {
        const next = input();
        if (fail) throw new Error("expected failure");
        return next * 2;
      });
      const errors: unknown[] = [failing.value];
      fail = true;
      setInput(2);
      try {
        errors.push(failing.value);
      } catch (error) {
        errors.push((error as Error).message.trim().split("\n")[0]);
      }
      fail = false;
      setInput(3);
      errors.push(failing.value);
      return {
        before,
        first,
        again,
        cached,
        overridden,
        lazy,
        reset,
        afterReset,
        equal,
        calls,
        dynamicValues,
        dynamicCalls,
        errors,
      };
    });
  }
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  const client = new URL("./src/internal/client/index.js", `file://${pkg}`)
    .pathname;
  const child = Bun.spawn(
    [
      process.execPath,
      "--conditions=browser",
      "-e",
      `import{state,derived,get,set,push,pop,effect_root}from ${JSON.stringify(client)};push({},true);try{const api={signal(initial){const value=state(initial);return[()=>get(value),next=>set(value,next)]},derived(fn){const value=derived(fn);return{get value(){return get(value)},set value(next){set(value,next)}}},root(fn){let result;const stop=effect_root(()=>{result=fn()});stop();return result}};console.log(JSON.stringify((${exercise.toString()})(api)));}finally{pop();}`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, error).toBe(0);
  expect(error).toBe("");
  expect(
    exercise({
      signal: (initial) => {
        const [read, write] = createSignal(initial);
        return [read, write];
      },
      derived: createDerived,
      root: (fn) =>
        createRoot((stop) => {
          try {
            return fn();
          } finally {
            stop();
          }
        }),
    }),
  ).toEqual(JSON.parse(output));
}, 30000);

test("cleanup derived history recomputes changed diamonds separately and caches self-writes", () => {
  createRoot((stop) => {
    const source = createState(1),
      unrelated = createState(0);
    let calls = 0;
    const left = createDerived(() => {
      calls++;
      return source.value * 2;
    });
    const right = createDerived(() => source.value * 3);
    const total = createDerived(() => left.value + right.value);
    expect(total.value).toBe(5);
    holdHistory();
    try {
      unrelated.value = 1;
      withHistoryCleanup(() => expect(total.value).toBe(5));
      expect(calls).toBe(1);
    } finally {
      releaseHistory();
    }
    holdHistory();
    try {
      source.value = 3;
      const beforeCleanup = calls;
      withHistoryCleanup(() => {
        expect([left.value, right.value, total.value]).toEqual([2, 3, 5]);
        source.value = 7;
        expect([source.value, left.value, total.value]).toEqual([7, 2, 5]);
      });
      // Official authored teardown: one historical evaluation; unobserved live
      // diamonds remain lazy until the subsequent explicit live read.
      expect(calls).toBe(beforeCleanup + 1);
      const afterCleanup = calls;
      expect(total.value).toBe(35);
      expect(calls).toBe(afterCleanup + 1);
    } finally {
      releaseHistory();
      stop();
    }
  });
});

test("override history preserves first prior value after initial dependency discovery", () => {
  createRoot((stop) => {
    const source = createState(1);
    let calls = 0;
    const value = createDerived(() => {
      calls++;
      return source.value * 2;
    });
    const untouched = createDerived(() => {
      calls++;
      return source.value * 3;
    });
    untouched.value = 99;
    expect(calls).toBe(1);
    expect(value.value).toBe(2);
    holdHistory();
    try {
      value.value = 20;
      source.value = 3;
      withHistoryCleanup(() => expect(value.value).toBe(2));
      expect(calls).toBe(2);
      expect(value.value).toBe(6);
      expect(calls).toBe(3);
    } finally {
      releaseHistory();
      stop();
    }
  });
});

test("rune effect teardown observes prior derived values while next callback sees current values", async () => {
  const { createRuneEffect } = await import("../src/effect");
  const rows: Array<[string, number, number]> = [];
  let write!: (value: number) => void;
  const stop = createRoot((dispose) => {
    const source = createState(1);
    const value = createDerived(() => source.value * 2);
    write = (next) => {
      source.value = next;
    };
    createRuneEffect(() => {
      rows.push(["run", source.value, value.value]);
      return () => {
        rows.push(["cleanup", source.value, value.value]);
      };
    });
    return dispose;
  });
  await Promise.resolve();
  write(2);
  write(3);
  await Promise.resolve();
  expect(rows).toEqual([
    ["run", 1, 2],
    ["cleanup", 1, 2],
    ["run", 3, 6],
  ]);
  stop();
});

test("pending disposal cleanup reads prior derived values after the derived owner stops", async () => {
  const rows: number[][] = [];
  let value!: ReturnType<typeof createDerived<number>>;
  let source!: ReturnType<typeof createState<number>>;
  const stop = createRoot((dispose) => {
    source = createState(1);
    value = createDerived(() => source.value * 2);
    expect(value.value).toBe(2);
    // Registered after the derived cleanup, as component onDestroy hooks can be.
    onCleanup(() =>
      withHistoryCleanup(() => rows.push([source.value, value.value])),
    );
    return dispose;
  });
  await Promise.resolve();
  holdHistory();
  try {
    source.value = 3;
    expect(value.value).toBe(6);
    stop();
    expect(rows).toEqual([[1, 2]]);
  } finally {
    releaseHistory();
  }
  expect(value.value).toBe(6);
});

test("imperative derived chains stay lazy through failures, recovery and disposal", () => {
  createRoot((stop) => {
    const input = createState(1),
      fail = createState(true);
    const trace: string[] = [];
    const source = createDerived(() => {
      trace.push(`${input.value}:${fail.value}`);
      if (fail.value) throw Error("expected");
      return [input.value];
    });
    const projection = createDerived(() => source.value[0]);
    expect(() => projection.value).toThrow("expected");
    expect(() => projection.value).toThrow("expected");
    expect(trace).toEqual(["1:true", "1:true"]);
    fail.value = false;
    expect(projection.value).toBe(1);
    expect(trace).toEqual(["1:true", "1:true", "1:false"]);
    input.value = 2;
    expect(trace).toEqual(["1:true", "1:true", "1:false"]);
    expect(projection.value).toBe(2);
    expect(trace).toEqual(["1:true", "1:true", "1:false", "2:false"]);
    stop();
    input.value = 3;
    expect(projection.value).toBe(2);
    expect(trace).toHaveLength(4);
  });
});

test("input invalidation restores computed history after an override has committed", async () => {
  const { createRuneEffect } = await import("../src/effect");
  const rows: unknown[][] = [];
  let source!: ReturnType<typeof createState<number>>;
  let value!: ReturnType<typeof createDerived<number>>;
  const stop = createRoot((dispose) => {
    source = createState(1);
    value = createDerived(() => source.value * 2);
    createRuneEffect(() => {
      rows.push(["run", source.value, value.value]);
      return () => rows.push(["cleanup", source.value, value.value]);
    });
    return dispose;
  });
  await Promise.resolve();
  value.value = 100;
  await Promise.resolve();
  source.value = 3;
  await Promise.resolve();
  expect(rows).toEqual([
    ["run", 1, 2],
    ["cleanup", 1, 2],
    ["run", 1, 100],
    ["cleanup", 1, 2],
    ["run", 3, 6],
  ]);
  stop();
  expect(rows.at(-1)).toEqual(["cleanup", 3, 6]);
});
