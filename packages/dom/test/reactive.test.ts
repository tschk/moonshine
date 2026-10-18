import { describe, expect, test } from "bun:test";
import {
  batch,
  createEffect,
  createComponentScope,
  onBeforeDispose,
  onAfterDispose,
  queuePostCommit,
  createComputed,
  createRenderEffect,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  on,
  onMount,
  runWithOwner,
  untrack,
} from "../src/reactive";

describe("independent Solid reactive primitives", () => {
  test("setters return values and preserve function values through updaters", () => {
    const [value, set] = createSignal(1);
    expect(set(2)).toBe(2);
    expect(set((previous) => previous + 1)).toBe(3);
    expect(value()).toBe(3);
    const callback = () => 7;
    const [getCallback, setCallback] = createSignal(() => 1);
    setCallback(() => callback);
    expect(getCallback()).toBe(callback);
    expect(batch(() => 42)).toBe(42);
  });

  test("effects start after root body and update synchronously with previous values", () => {
    const events: unknown[] = [];
    let set!: (value: number) => number;
    let stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      const [read, write] = createSignal(0);
      set = write;
      createEffect((previous) => {
        events.push([read(), previous]);
        return read();
      }, -1);
      events.push("render");
      expect(events).toEqual(["render"]);
    });
    expect(events).toEqual(["render", [0, -1]]);
    set(1);
    expect(events).toEqual(["render", [0, -1], [1, 0]]);
    stop();
    set(2);
    expect(events).toHaveLength(3);
  });

  test("dynamic dependencies, batching and untrack use the existing signal graph", () => {
    const [left, setLeft] = createSignal(true);
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const values: number[] = [];
    const stop = createRoot((dispose) => {
      createEffect(() => {
        values.push(left() ? a() : b());
        untrack(b);
      });
      return dispose;
    });
    setB(3);
    expect(values).toEqual([1]);
    batch(() => {
      setA(4);
      setA(5);
    });
    expect(values).toEqual([1, 5]);
    setLeft(false);
    setA(6);
    setB(7);
    expect(values).toEqual([1, 5, 3, 7]);
    stop();
  });

  test("reruns dispose nested effects and cleanups; root disposal is idempotent", async () => {
    const [read, set] = createSignal(0);
    const cleanups: string[] = [];
    const stop = createRoot((dispose) => {
      createEffect(() => {
        const value = read();
        onCleanup(() => {
          cleanups.push(`outer:${value}`);
        });
        createEffect(() => {
          onCleanup(() => {
            cleanups.push(`child:${value}`);
          });
        });
      });
      return dispose;
    });
    await Promise.resolve();
    set(1);
    await Promise.resolve();
    expect(cleanups).toEqual(["child:0", "outer:0"]);
    stop();
    stop();
    expect(cleanups).toEqual(["child:0", "outer:0", "child:1", "outer:1"]);
  });

  test("mount is untracked and cancelled when disposed before initial flush", () => {
    const [read, set] = createSignal(0);
    let mounted = 0;
    const stop = createRoot((dispose) => {
      onMount(() => {
        read();
        mounted++;
      });
      return dispose;
    });
    set(1);
    expect(mounted).toBe(1);
    stop();
    createRoot((dispose) => {
      onMount(() => {
        mounted++;
      });
      dispose();
    });
    expect(mounted).toBe(1);
  });

  test("restores owners after exceptions and finishes cleanup when one throws", () => {
    expect(getOwner()).toBeNull();
    const calls: number[] = [];
    const stop = createRoot((dispose) => {
      const captured = getOwner();
      expect(() =>
        runWithOwner(null, () => {
          throw Error("callback");
        }),
      ).toThrow("callback");
      expect(getOwner()).toBe(captured);
      onCleanup(() => {
        calls.push(1);
        throw Error("cleanup");
      });
      onCleanup(() => {
        calls.push(2);
      });
      return dispose;
    });
    expect(getOwner()).toBeNull();
    expect(stop).toThrow("cleanup");
    expect(calls).toEqual([1, 2]);
  });
});

test("roots require explicit disposal and signal equality follows Solid", () => {
  let childStop!: () => void;
  const calls: string[] = [];
  const stop = createRoot((dispose) => {
    createRoot((childDispose) => {
      childStop = childDispose;
      onCleanup(() => {
        calls.push("child");
      });
    });
    onCleanup(() => {
      calls.push("parent");
    });
    return dispose;
  });
  stop();
  expect(calls).toEqual(["parent"]);
  childStop();
  expect(calls).toEqual(["parent", "child"]);
  const [read, write] = createSignal(NaN);
  let runs = 0;
  const end = createRoot((dispose) => {
    createEffect(() => {
      read();
      runs++;
    });
    return dispose;
  });
  write(NaN);
  expect(runs).toBe(2);
  end();
  const [always, setAlways] = createSignal(1, { equals: false });
  const endAlways = createRoot((dispose) => {
    createEffect(() => {
      always();
      runs++;
    });
    return dispose;
  });
  setAlways(1);
  expect(runs).toBe(4);
  endAlways();
});

test("custom equality suppresses notifications and cleanup reads stay untracked", () => {
  const [read, write] = createSignal(
    { id: 1 },
    {
      equals: (previous, next) => previous.id === next.id,
    },
  );
  const [other, setOther] = createSignal(0);
  let runs = 0;
  const end = createRoot((dispose) => {
    createEffect(() => {
      read();
      runs++;
      onCleanup(() => {
        other();
      });
    });
    return dispose;
  });
  write({ id: 1 });
  expect(runs).toBe(1);
  write({ id: 2 });
  setOther(1);
  expect(runs).toBe(2);
  end();
});

test("disposing during initial effect detaches its signal subscriptions", () => {
  const [read, set] = createSignal(0);
  let runs = 0;
  createRoot((dispose) => {
    createEffect(() => {
      read();
      runs++;
      dispose();
    });
  });
  set(1);
  expect(runs).toBe(1);
});

test("computed and render effects run immediately and clean up on updates", () => {
  const [read, set] = createSignal(1);
  const events: unknown[] = [];
  const stop = createRoot((dispose) => {
    createComputed((previous) => {
      const value = read();
      events.push([value, previous]);
      onCleanup(() => {
        events.push("cleanup");
      });
      return value;
    }, 0);
    createRenderEffect(() => {
      events.push("render");
    });
    expect(events).toEqual([[1, 0], "render"]);
    return dispose;
  });
  set(2);
  expect(events).toEqual([[1, 0], "render", "cleanup", [2, 1]]);
  stop();
  set(3);
  expect(events.at(-1)).toBe("cleanup");
});

test("memos are eager, cached, receive previous values and detach on disposal", () => {
  const [read, set] = createSignal(1);
  const previousValues: number[] = [];
  const cleanup: number[] = [];
  let memo!: () => number;
  const stop = createRoot((dispose) => {
    memo = createMemo((previous) => {
      previousValues.push(previous);
      const value = read();
      onCleanup(() => {
        cleanup.push(value);
      });
      return previous + value;
    }, 0);
    expect(previousValues).toEqual([0]);
    expect(memo()).toBe(1);
    expect(memo()).toBe(1);
    return dispose;
  });
  set(2);
  expect(previousValues).toEqual([0, 1]);
  expect(memo()).toBe(3);
  stop();
  set(4);
  expect(memo()).toBe(3);
  expect(previousValues).toEqual([0, 1]);
  expect(cleanup).toEqual([1, 2]);
});

test("memo equality controls downstream notifications and previous retained values", () => {
  const [read, set] = createSignal(1);
  const observed: number[] = [];
  const previous: Array<number | undefined> = [];
  const stop = createRoot((dispose) => {
    const parity = createMemo((value) => {
      previous.push(value);
      return read() % 2;
    });
    createComputed(() => {
      observed.push(parity());
    });
    return dispose;
  });
  set(3);
  set(4);
  expect(observed).toEqual([1, 0]);
  expect(previous).toEqual([undefined, 1, 1]);
  stop();
  const stopAlways = createRoot((dispose) => {
    const always = createMemo(() => read() % 2, undefined, { equals: false });
    createComputed(() => {
      observed.push(always());
    });
    return dispose;
  });
  set(6);
  expect(observed).toEqual([1, 0, 0, 0]);
  stopAlways();
});

test("memo custom equality and diamond dependencies settle before observation", () => {
  const [read, set] = createSignal(1);
  const observed: number[] = [];
  const stop = createRoot((dispose) => {
    const left = createMemo(() => read() * 2);
    const right = createMemo(() => read() * 3);
    const object = createMemo(() => ({ sum: left() + right() }), undefined, {
      equals: (previous, next) => previous.sum === next.sum,
    });
    createComputed(() => {
      observed.push(object().sum);
    });
    return dispose;
  });
  set(2);
  expect(observed).toEqual([5, 10]);
  stop();
});

test("failed deferred starts clean their children and do not drop queued effects", () => {
  const failure = new Error("failed effect");
  const [read, set] = createSignal(0);
  const observed: number[] = [];
  const childReads: number[] = [];
  const cleanup: string[] = [];
  let stop!: () => void;
  let root!: ReturnType<typeof getOwner>;
  expect(() =>
    createRoot((dispose) => {
      stop = dispose;
      root = getOwner();
      createEffect(() => {
        onCleanup(() => {
          cleanup.push("failed");
          throw new Error("cleanup failure");
        });
        createComputed(() => {
          childReads.push(read());
          onCleanup(() => {
            cleanup.push("child");
          });
        });
        throw failure;
      });
      createEffect(() => {
        observed.push(read());
      });
      createEffect(() => {
        throw new Error("later failure");
      });
    }),
  ).toThrow(failure);
  expect(cleanup).toEqual(["child", "failed"]);
  expect(root!.children.size).toBe(1);
  expect(observed).toEqual([0]);
  set(1);
  expect(observed).toEqual([0, 1]);
  expect(childReads).toEqual([0]);
  stop();
  set(2);
  expect(observed).toEqual([0, 1]);
  expect(root!.children.size).toBe(0);
});

test("root callback errors dispose owned pending effects before they start", () => {
  const failure = new Error("root callback failure");
  const observed: string[] = [];
  let stop!: () => void;
  expect(() =>
    createRoot((dispose) => {
      stop = dispose;
      createEffect(() => {
        throw new Error("effect failure");
      });
      createEffect(() => {
        observed.push("started");
      });
      throw failure;
    }),
  ).toThrow(failure);
  expect(observed).toEqual([]);
  stop();
  expect(createRoot(() => 42)).toBe(42);
});

test("caught initial memo failures dispose every child and cleanup", () => {
  const failure = new Error("memo failed");
  const [read, set] = createSignal(0);
  let runs = 0;
  const cleaned: string[] = [];
  const stop = createRoot((dispose) => {
    expect(() =>
      createMemo(() => {
        createComputed(() => {
          read();
          runs++;
        });
        onCleanup(() => {
          cleaned.push("first");
          throw new Error("cleanup failed");
        });
        onCleanup(() => {
          cleaned.push("second");
        });
        throw failure;
      }),
    ).toThrow(failure);
    expect(getOwner()!.children.size).toBe(0);
    return dispose;
  });
  expect(cleaned).toEqual(["first", "second"]);
  expect(runs).toBe(1);
  set(1);
  expect(runs).toBe(1);
  stop();
  expect(cleaned).toEqual(["first", "second"]);
});

test("failed memo updates clean newly owned work and can recover", () => {
  const [source, setSource] = createSignal(0);
  const [read, set] = createSignal(0);
  const observed: number[] = [];
  const cleaned: number[] = [];
  let memo!: () => number;
  const stop = createRoot((dispose) => {
    memo = createMemo(() => {
      const value = source();
      createComputed(() => {
        read();
        observed.push(value);
      });
      onCleanup(() => {
        cleaned.push(value);
      });
      if (value === 1) throw new Error("update failed");
      return value;
    });
    return dispose;
  });
  expect(() => setSource(1)).toThrow("update failed");
  expect(cleaned).toEqual([0, 1]);
  set(1);
  expect(observed).toEqual([0, 1]);
  setSource(2);
  expect(memo()).toBe(2);
  expect(observed).toEqual([0, 1, 2]);
  stop();
  expect(cleaned).toEqual([0, 1, 2]);
});

test("failed computation updates clean children, preserve errors and recover", () => {
  const failure = new Error("computation update failed");
  const [source, setSource] = createSignal(0);
  const [read, set] = createSignal(0);
  const observed: number[] = [];
  const cleaned: number[] = [];
  const previousValues: number[] = [];
  const stop = createRoot((dispose) => {
    createComputed((previous) => {
      const value = source();
      previousValues.push(previous);
      createComputed(() => {
        read();
        observed.push(value);
      });
      onCleanup(() => {
        cleaned.push(value);
        if (value === 1) throw new Error("cleanup failure");
      });
      onCleanup(() => {
        cleaned.push(-value);
      });
      if (value === 1) throw failure;
      return value;
    }, -1);
    return dispose;
  });
  expect(() => setSource(1)).toThrow(failure);
  expect(cleaned).toEqual([0, -0, 1, -1]);
  set(1);
  expect(observed).toEqual([0, 1]);
  setSource(2);
  expect(previousValues).toEqual([-1, 0, 0]);
  expect(observed).toEqual([0, 1, 2]);
  stop();
  set(2);
  expect(observed).toEqual([0, 1, 2]);
  expect(cleaned).toEqual([0, -0, 1, -1, 2, -2]);
});

test("failed root callbacks dispose subscriptions and preserve callback errors over cleanup failures", () => {
  const failure = new Error("root callback failed");
  const [read, write] = createSignal(0);
  const observed: number[] = [];
  const cleaned: string[] = [];
  let root: ReturnType<typeof getOwner>;
  expect(() =>
    createRoot(() => {
      root = getOwner();
      createComputed(() => {
        observed.push(read());
        onCleanup(() => cleaned.push("computation"));
      });
      onCleanup(() => {
        cleaned.push("throwing");
        throw new Error("cleanup failed");
      });
      onCleanup(() => cleaned.push("root"));
      throw failure;
    }),
  ).toThrow(failure);
  expect(cleaned).toContain("computation");
  expect(cleaned).toContain("throwing");
  expect(cleaned).toContain("root");
  expect(root!.disposed).toBe(true);
  expect(root!.children.size).toBe(0);
  write(1);
  expect(observed).toEqual([0]);
  expect(cleaned).toHaveLength(3);
});

test("failed root callbacks still drain independently owned nested roots", () => {
  const failure = new Error("outer failed");
  const [read, write] = createSignal(0);
  const observed: number[] = [];
  let stop!: () => void;
  expect(() =>
    createRoot(() => {
      createRoot((dispose) => {
        stop = dispose;
        createEffect(() => {
          observed.push(read());
        });
      });
      createEffect(() => {
        throw new Error("disposed outer effect must not start");
      });
      throw failure;
    }),
  ).toThrow(failure);
  expect(observed).toEqual([0]);
  write(1);
  expect(observed).toEqual([0, 1]);
  stop();
  write(2);
  expect(observed).toEqual([0, 1]);
});

test("native transactions defer new root mounts and cancel disposed queued callbacks", () => {
  const order: string[] = [];
  let stop = () => {};
  batch(() => {
    stop = createRoot((dispose) => {
      onMount(() => order.push("mount"));
      return dispose;
    });
    order.push("body");
    expect(order).toEqual(["body"]);
  });
  expect(order).toEqual(["body", "mount"]);
  stop();
  batch(() => {
    const dispose = createRoot((end) => {
      onMount(() => order.push("cancelled"));
      return end;
    });
    dispose();
  });
  expect(order).toEqual(["body", "mount"]);
});

test("transaction callback failures including undefined outrank queued mount failures", () => {
  let stop = () => {};
  const called: number[] = [];
  let caught = false;
  try {
    batch(() => {
      stop = createRoot((dispose) => {
        onMount(() => {
          called.push(1);
          throw Error("mount");
        });
        onMount(() => {
          called.push(2);
        });
        return dispose;
      });
      throw undefined;
    });
  } catch (error) {
    caught = true;
    expect(error).toBeUndefined();
  }
  expect(caught).toBe(true);
  expect(called).toEqual([1, 2]);
  stop();
});

test("on tracks explicit accessors, callback history and cleanup without callback dependencies", () => {
  const [input, setInput] = createSignal(1),
    [incidental, setIncidental] = createSignal(10),
    [output, setOutput] = createSignal(0);
  const calls: unknown[] = [];
  let cleanups = 0;
  const stop = createRoot((dispose) => {
    createComputed(
      on(input, (value, previous, total: number | undefined) => {
        calls.push([value, previous, total, incidental()]);
        onCleanup(() => cleanups++);
        setOutput(output() + 1);
        return (total ?? 0) + value;
      }),
    );
    return dispose;
  });
  expect(calls).toEqual([[1, undefined, undefined, 10]]);
  setIncidental(20);
  expect(calls).toHaveLength(1);
  batch(() => {
    setInput(2);
    setInput(3);
  });
  expect(calls).toEqual([
    [1, undefined, undefined, 10],
    [3, 1, 1, 20],
  ]);
  expect(output()).toBe(2);
  expect(cleanups).toBe(1);
  stop();
  setInput(4);
  expect(calls).toHaveLength(2);
  expect(cleanups).toBe(2);
});

test("on readonly tuples infer inputs and defer preserves caller previous value", () => {
  const [count, setCount] = createSignal(1),
    [label, setLabel] = createSignal("a");
  const calls: unknown[] = [];
  const callback = on(
    [count, label] as const,
    (value, previous, total: number | undefined) => {
      const numeric: number = value[0];
      const text: string = value[1];
      calls.push([numeric, text, previous, total]);
      return (total ?? 0) + numeric;
    },
    { defer: true },
  );
  const stop = createRoot((dispose) => {
    createComputed(callback, 10);
    return dispose;
  });
  expect(calls).toEqual([]);
  setLabel("b");
  expect(calls).toEqual([[1, "b", undefined, 10]]);
  setCount(2);
  expect(calls[1]).toEqual([2, "b", [1, "b"], 11]);
  stop();
});

test("on switches dynamically selected dependencies and preserves previous input after errors", () => {
  const [choose, setChoose] = createSignal(true),
    [a, setA] = createSignal(1),
    [b, setB] = createSignal(10);
  const values: number[] = [];
  const stop = createRoot((dispose) => {
    createComputed(
      on(
        () => (choose() ? a() : b()),
        (value) => {
          values.push(value);
        },
      ),
    );
    return dispose;
  });
  setB(11);
  setChoose(false);
  setA(2);
  setB(12);
  expect(values).toEqual([1, 11, 12]);
  stop();
  let fail = false;
  const history: unknown[] = [];
  const callback = on(a, (value, previous) => {
    if (fail) throw new Error("callback error");
    history.push(previous);
    return value;
  });
  expect(callback(undefined)).toBe(2);
  fail = true;
  expect(() => callback(2)).toThrow("callback error");
  fail = false;
  setA(3);
  expect(callback(2)).toBe(3);
  expect(history).toEqual([undefined, 2]);
});

test("on input/value histories, defer, dynamic dependencies and callback writes match Solid", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { createRequire } = await import("node:module");
  const directory = await mkdtemp(join(tmpdir(), "moonshine-on-reference-"));
  try {
    const entry = join(directory, "reference.ts");
    await writeFile(
      entry,
      `export {on,createSignal,createComputed,createRoot,batch} from ${JSON.stringify(resolve(import.meta.dir, "../../../node_modules/solid-js/dist/solid.js"))};`,
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "cjs",
    });
    expect(result.success).toBe(true);
    const referenceFile = join(directory, "reference.cjs");
    await writeFile(referenceFile, await result.outputs[0]!.text());
    const reference = createRequire(import.meta.url)(referenceFile) as {
      on: typeof on;
      createSignal: typeof createSignal;
      createComputed: typeof createComputed;
      createRoot: typeof createRoot;
      batch: typeof batch;
    };
    function scenario(api: typeof reference) {
      const [a, setA] = api.createSignal(1),
        [b, setB] = api.createSignal(10),
        [selected, setSelected] = api.createSignal(true),
        [output, setOutput] = api.createSignal(0);
      const history: unknown[] = [];
      const stop = api.createRoot((dispose) => {
        api.createComputed(
          api.on(
            () => (selected() ? a() : b()),
            (input, previous, total: number | undefined) => {
              history.push(["single", input, previous, total]);
              setOutput(output() + 1);
              return (total ?? 0) + input;
            },
          ),
        );
        api.createComputed(
          api.on(
            [a, b] as const,
            (input, previous, total: number | undefined) => {
              history.push(["tuple", [...input], previous, total]);
              return (total ?? 0) + input[0] + input[1];
            },
            { defer: true },
          ),
          100,
        );
        return dispose;
      });
      setB(11);
      api.batch(() => {
        setA(2);
        setA(3);
      });
      setSelected(false);
      setA(4);
      stop();
      setB(12);
      return { history, output: output() };
    }
    expect(
      scenario({ on, createSignal, createComputed, createRoot, batch }),
    ).toEqual(scenario(reference));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

test("final disposal hooks are parent-first before live work and child-first after DOM removal", async () => {
  await import("../../react/test/dom");
  const { h, render } = await import("../src/dom");
  const container = document.createElement("main");
  document.body.append(container);
  const [value, set] = createSignal(0);
  const trace: string[] = [];
  let observed = 0,
    parent!: ReturnType<typeof getOwner>,
    child!: ReturnType<typeof getOwner>;
  const stop = render(
    () =>
      h(() => {
        parent = getOwner();
        onBeforeDispose(() => {
          expect(getOwner()).toBe(parent);
          expect(parent!.disposed).toBe(false);
          expect(container.querySelector("span")?.isConnected).toBe(true);
          set(1);
          expect(observed).toBe(1);
          trace.push("parent-before");
        });
        onAfterDispose(() => {
          expect(getOwner()).toBe(parent);
          expect(parent!.disposed).toBe(true);
          expect(container.childNodes).toHaveLength(0);
          trace.push("parent-after");
        });
        return h(() => {
          child = getOwner();
          createComputed(() => {
            observed = value();
          });
          onBeforeDispose(() => {
            expect(getOwner()).toBe(child);
            expect(child!.disposed).toBe(false);
            trace.push("child-before");
          });
          onAfterDispose(() => {
            expect(container.childNodes).toHaveLength(0);
            trace.push("child-after");
          });
          return h("span", null, "child");
        }, null);
      }, null),
    container,
  );
  stop();
  expect(trace).toEqual([
    "parent-before",
    "child-before",
    "child-after",
    "parent-after",
  ]);
  set(2);
  expect(observed).toBe(1);
  container.remove();
});

test("reentrant disposal and callback failures drain cleanup/stop/after hooks preserving first error", () => {
  const first = new Error("before failure");
  const trace: string[] = [];
  let stop = () => {};
  createRoot((dispose) => {
    stop = dispose;
    getOwner()!.stop = () => {
      trace.push("stop");
      throw new Error("stop failure");
    };
    onBeforeDispose(() => {
      trace.push("before");
      stop();
      throw first;
    });
    onBeforeDispose(() => trace.push("before-peer"));
    onCleanup(() => {
      trace.push("cleanup");
      throw new Error("cleanup failure");
    });
    createComponentScope(() => {
      onAfterDispose(() => {
        trace.push("child-after");
        throw new Error("after failure");
      });
      onCleanup(() => trace.push("child-cleanup"));
    });
    onAfterDispose(() => trace.push("parent-after"));
  });
  expect(() => stop()).toThrow(first);
  expect(trace).toEqual([
    "before",
    "before-peer",
    "child-cleanup",
    "cleanup",
    "stop",
    "child-after",
    "parent-after",
  ]);
  stop();
  expect(trace).toHaveLength(7);
  expect(() => onBeforeDispose(() => {})).toThrow("live native owner");
  expect(() => onAfterDispose(() => {})).toThrow("live native owner");
});

test("after-dispose callbacks wait through branch cleanup and the containing DOM commit", async () => {
  await import("../../react/test/dom");
  const { h, render } = await import("../src/dom");
  const { Show } = await import("../src/control");
  const container = document.createElement("main");
  document.body.append(container);
  const [visible, setVisible] = createSignal(true);
  const trace: string[] = [];
  const stop = render(
    () =>
      Show({
        when: visible,
        children: () =>
          h(() => {
            onAfterDispose(() => trace.push(`after:${container.textContent}`));
            return h("span", null, "branch");
          }, null),
        fallback: () => h("p", null, "fallback"),
      }),
    container,
  );
  setVisible(false);
  expect(trace).toEqual(["after:fallback"]);
  stop();
  container.remove();
  let before = 0,
    after = 0;
  const [value, setValue] = createSignal(0);
  const dispose = createRoot((stopRoot) => {
    createComputed(() => {
      value();
      onBeforeDispose(() => before++);
      onAfterDispose(() => after++);
      onCleanup(() => queuePostCommit(() => {}));
    });
    return stopRoot;
  });
  setValue(1);
  expect([before, after]).toEqual([0, 0]);
  dispose();
  expect([before, after]).toEqual([2, 2]);
});

test("post-commit work outside a native commit waits a microtask and roots enqueue without one", async () => {
  const trace: string[] = [];
  queuePostCommit(() => trace.push("outside"));
  expect(trace).toEqual([]);
  await Promise.resolve();
  expect(trace).toEqual(["outside"]);
  createRoot((stop) => {
    queuePostCommit(() => trace.push("root"));
    expect(trace).toEqual(["outside"]);
    stop();
  });
  expect(trace).toEqual(["outside", "root"]);
});

test("outside-commit post callbacks preserve registration FIFO when a callback enqueues more work", async () => {
  const trace: number[] = [];
  queuePostCommit(() => {
    trace.push(1);
    queuePostCommit(() => trace.push(3));
  });
  queuePostCommit(() => trace.push(2));
  expect(trace).toEqual([]);
  await Promise.resolve();
  expect(trace).toEqual([1, 2, 3]);
});

test("disposed owners reject attached work but permit independently stopped roots", () => {
  const [value, setValue] = createSignal(0);
  let runs = 0;
  let stopDetached!: () => void;
  const stop = createRoot((dispose) => {
    onAfterDispose(() => {
      for (const attach of [
        createComputed,
        createRenderEffect,
        createMemo,
        createEffect,
      ]) {
        expect(() =>
          attach(() => {
            value();
            runs++;
          }),
        ).toThrow("disposed native owner");
      }
      stopDetached = createRoot((disposeDetached) => {
        createComputed(() => {
          value();
          runs++;
        });
        return disposeDetached;
      });
    });
    return dispose;
  });
  stop();
  expect(runs).toBe(1);
  setValue(1);
  expect(runs).toBe(2);
  stopDetached();
  setValue(2);
  expect(runs).toBe(2);
});

test("before-dispose hooks may create attached work that is immediately cleaned", () => {
  const [value, setValue] = createSignal(0);
  let runs = 0,
    cleanups = 0;
  const stop = createRoot((dispose) => {
    onBeforeDispose(() => {
      createComputed(() => {
        value();
        runs++;
        onCleanup(() => cleanups++);
      });
    });
    return dispose;
  });
  stop();
  expect([runs, cleanups]).toEqual([1, 1]);
  setValue(1);
  expect([runs, cleanups]).toEqual([1, 1]);
});

test("before-disposal may add after finalizers without reviving owners or skipping peers", () => {
  const seen: string[] = [];
  const owners: NonNullable<ReturnType<typeof getOwner>>[] = [];
  const failure = new Error("child-after");
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    owners.push(getOwner()!);
    onBeforeDispose(() => {
      seen.push("parent-before");
      onAfterDispose(() => seen.push("parent-late"));
      expect(() => onBeforeDispose(() => {})).toThrow("live native owner");
    });
    onAfterDispose(() => seen.push("parent-after"));
    createComponentScope(() => {
      owners.push(getOwner()!);
      onBeforeDispose(() => {
        seen.push("child-before");
        onAfterDispose(() => {
          seen.push("child-late");
          throw failure;
        });
      });
      onAfterDispose(() => seen.push("child-after"));
    });
  });
  expect(() => stop()).toThrow(failure);
  expect(seen).toEqual([
    "parent-before",
    "child-before",
    "child-after",
    "child-late",
    "parent-after",
    "parent-late",
  ]);
  stop();
  expect(seen).toHaveLength(6);
  for (const owner of owners)
    expect(() => runWithOwner(owner, () => onAfterDispose(() => {}))).toThrow(
      "live native owner",
    );
  expect(() => onAfterDispose(() => {})).toThrow("live native owner");
});

test("initially empty effects and memos still clean later work without tracking cleanup reads", () => {
  for (const kind of ["effect", "memo"] as const) {
    const [read, write] = createSignal(0);
    const [other, setOther] = createSignal(0);
    const values: number[] = [];
    const cleaned: number[] = [];
    const stop = createRoot((dispose) => {
      const body = () => {
        const value = read();
        values.push(value);
        if (value > 0)
          onCleanup(() => {
            other();
            cleaned.push(value);
          });
        return value;
      };
      if (kind === "effect") createEffect(body);
      else createMemo(body);
      return dispose;
    });
    write(1);
    write(2);
    setOther(1);
    expect(values).toEqual([0, 1, 2]);
    expect(cleaned).toEqual([1]);
    stop();
    expect(cleaned).toEqual([1, 2]);
  }
});
