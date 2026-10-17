import { expect, test } from "bun:test";
import {
  For,
  Index,
  indexArray,
  mapArray,
  Show,
  Match,
  Switch,
} from "../src/control";
import {
  createComputed,
  createRoot,
  createSignal,
  onCleanup,
} from "../src/reactive";

test("keyed mapping retains values/owners and updates index accessors on reorder", () => {
  const a = { id: "a" },
    b = { id: "b" },
    c = { id: "c" };
  const [items, set] = createSignal([a, b, c]);
  const removed: string[] = [];
  let mapped!: () => Array<{ item: typeof a; index: () => number }>;
  const stop = createRoot((dispose) => {
    mapped = For({
      each: items,
      children: (item, index) => {
        onCleanup(() => {
          removed.push(item.id);
        });
        return { item, index };
      },
    });
    return dispose;
  });
  const original = mapped();
  set([c, a, b]);
  expect(mapped()).toEqual([original[2]!, original[0]!, original[1]!]);
  expect(mapped()[0]).toBe(original[2]);
  expect(original.map((entry) => entry.index())).toEqual([1, 2, 0]);
  expect(removed).toEqual([]);
  set([b, a]);
  expect(removed).toEqual(["c"]);
  stop();
  expect(removed).toEqual(["c", "b", "a"]);
  set([c]);
  expect(removed).toHaveLength(3);
});

test("duplicate identities have separate roots retained in occurrence order", () => {
  const [items, set] = createSignal(["a", "a", "b"]);
  let created = 0;
  const removed: number[] = [];
  let mapped!: () => Array<{ id: number; index: () => number }>;
  const stop = createRoot((dispose) => {
    mapped = mapArray(items, (_item, index) => {
      const id = ++created;
      onCleanup(() => {
        removed.push(id);
      });
      return { id, index };
    });
    return dispose;
  });
  const first = mapped();
  set(["a", "b", "a", "a"]);
  expect(mapped().map((entry) => entry.id)).toEqual([1, 3, 2, 4]);
  expect(mapped()[0]).toBe(first[0]);
  set(["b", "a"]);
  expect(mapped().map((entry) => entry.id)).toEqual([3, 1]);
  expect(removed.sort()).toEqual([2, 4]);
  stop();
  expect(removed.sort()).toEqual([1, 2, 3, 4]);
});

test("removed duplicate entries clean up in previous list order", () => {
  const [items, set] = createSignal(["a", "b", "a", "c", "b"]);
  const removed: Array<[string, number]> = [];
  let serial = 0;
  createRoot((dispose) => {
    const mapped = mapArray(items, (item) => {
      const id = serial++;
      onCleanup(() => removed.push([item, id]));
      return id;
    });
    expect(mapped()).toEqual([0, 1, 2, 3, 4]);
    set(["b", "a", "d", "a"]);
    expect(mapped()).toEqual([1, 0, 5, 2]);
    expect(removed).toEqual([
      ["c", 3],
      ["b", 4],
    ]);
    set([]);
    expect(removed).toEqual([
      ["c", 3],
      ["b", 4],
      ["b", 1],
      ["a", 0],
      ["d", 5],
      ["a", 2],
    ]);
    dispose();
    expect(removed).toHaveLength(6);
  });
});

test("removed list item computations detach and mapper errors dispose new roots", () => {
  const [items, set] = createSignal([1]);
  const [read, update] = createSignal(0);
  const ran: number[] = [],
    disposed: number[] = [];
  const stop = createRoot((dispose) => {
    mapArray(items, (item) => {
      onCleanup(() => {
        disposed.push(item);
      });
      createComputed(() => {
        read();
        ran.push(item);
      });
      if (item === 3) throw Error("mapper");
      return item;
    });
    return dispose;
  });
  set([]);
  update(1);
  expect(ran).toEqual([1]);
  expect(() => set([2, 3])).toThrow("mapper");
  expect(disposed).toEqual([1, 3, 2]);
  update(2);
  expect(ran).toEqual([1, 2, 3]);
  stop();
});

test("Show retains truthy branch, updates value accessors and disposes transitions", () => {
  const [when, set] = createSignal<string | false>(false);
  const disposed: string[] = [],
    values: string[] = [];
  let created = 0;
  let shown!: () => { id: number } | undefined;
  const stop = createRoot((dispose) => {
    shown = Show({
      when,
      children: (value) => {
        created++;
        onCleanup(() => {
          disposed.push("true");
        });
        createComputed(() => {
          values.push(value());
        });
        return { id: created };
      },
      fallback: () => {
        onCleanup(() => {
          disposed.push("false");
        });
        return { id: 0 };
      },
    });
    return dispose;
  });
  expect(shown()).toEqual({ id: 0 });
  set("a");
  const first = shown();
  set("b");
  expect(shown()).toBe(first);
  expect(values).toEqual(["a", "b"]);
  expect(created).toBe(1);
  set(false);
  expect(disposed).toEqual(["false", "true"]);
  expect(shown()).toEqual({ id: 0 });
  stop();
  expect(disposed).toEqual(["false", "true", "false"]);
});

test("initially visible Show disposes consumers before its value becomes false", () => {
  const [when, set] = createSignal<string | false>("visible");
  const values: string[] = [];
  const stop = createRoot((dispose) => {
    Show({
      when,
      children: (value) => {
        createComputed(() => {
          values.push(value());
        });
        return "branch";
      },
    });
    return dispose;
  });
  expect(() => set(false)).not.toThrow();
  expect(values).toEqual(["visible"]);
  set("again");
  expect(values).toEqual(["visible", "again"]);
  stop();
});

test("list disposal continues after an item cleanup throws", () => {
  const removed: number[] = [];
  const stop = createRoot((dispose) => {
    mapArray(
      () => [1, 2],
      (item) => {
        onCleanup(() => {
          removed.push(item);
          if (item === 1) throw Error("cleanup");
        });
        return item;
      },
    );
    return dispose;
  });
  expect(stop).toThrow("cleanup");
  expect(removed).toEqual([1, 2]);
});

test("mapper errors survive throwing cleanups in failed and newly created roots", () => {
  const [items, setItems] = createSignal<number[]>([]);
  const cleaned: number[] = [];
  const stop = createRoot((dispose) => {
    mapArray(items, (item) => {
      onCleanup(() => {
        cleaned.push(item);
        throw new Error(`cleanup ${item}`);
      });
      onCleanup(() => {
        cleaned.push(-item);
      });
      if (item === 3) throw new Error("mapper failed");
      return item;
    });
    return dispose;
  });
  expect(() => setItems([1, 2, 3])).toThrow("mapper failed");
  expect(cleaned).toEqual([3, -3, 1, -1, 2, -2]);
  expect(stop).not.toThrow();
});

test("list cleanup reads do not subscribe the mapping memo", () => {
  const [items, setItems] = createSignal([1]);
  const [other, setOther] = createSignal(0);
  let listReads = 0;
  const stop = createRoot((dispose) => {
    mapArray(
      () => {
        listReads++;
        return items();
      },
      (item) => {
        onCleanup(() => {
          other();
        });
        return item;
      },
    );
    return dispose;
  });
  setItems([]);
  expect(listReads).toBe(2);
  setOther(1);
  expect(listReads).toBe(2);
  stop();
});

test("list reads recover new entries after a removed cleanup throws", () => {
  const [items, setItems] = createSignal([1]);
  const cleaned: number[] = [];
  let mapped!: () => number[];
  const stop = createRoot((dispose) => {
    mapped = mapArray(items, (item) => {
      onCleanup(() => {
        cleaned.push(item);
        if (item === 1) throw new Error("removed cleanup");
      });
      return item;
    });
    return dispose;
  });
  expect(() => setItems([2])).toThrow("removed cleanup");
  expect(mapped()).toEqual([2]);
  expect(cleaned).toEqual([1]);
  stop();
  stop();
  expect(cleaned).toEqual([1, 2]);
});

test("Index retains positions while values, duplicate values and undefined change", () => {
  const [items, set] = createSignal<Array<string | undefined>>([
    "a",
    "a",
    undefined,
  ]);
  const disposed: number[] = [];
  let mapped!: ReturnType<
    typeof indexArray<
      string | undefined,
      { item: () => string | undefined; index: number }
    >
  >;
  const stop = createRoot((dispose) => {
    mapped = Index({
      each: items,
      children: (item, index) => {
        onCleanup(() => disposed.push(index));
        return { item, index };
      },
    });
    return dispose;
  });
  const first = mapped();
  set([undefined, "b", "a"]);
  expect(mapped().every((entry, index) => entry === first[index])).toBe(true);
  expect(first.map((entry) => entry.item())).toEqual([undefined, "b", "a"]);
  set(["x"]);
  expect(mapped()[0]).toBe(first[0]);
  expect(disposed).toEqual([1, 2]);
  set(["x", "y"]);
  expect(mapped()[1]).not.toBe(first[1]);
  stop();
  expect(disposed).toEqual([1, 2, 0, 1]);
  set(["ignored"]);
  expect(disposed).toHaveLength(4);
});

test("indexArray stores function items without invoking them and detaches owned consumers", () => {
  let invoked = 0;
  const first = () => {
      invoked++;
      return 1;
    },
    second = () => {
      invoked++;
      return 2;
    };
  const [items, set] = createSignal([first]);
  const observed: Array<() => number> = [];
  const stop = createRoot((dispose) => {
    indexArray(items, (item) => {
      createComputed(() => observed.push(item()));
      return item;
    });
    return dispose;
  });
  set([second]);
  expect(observed).toEqual([first, second]);
  expect(invoked).toBe(0);
  stop();
  set([first]);
  expect(observed).toHaveLength(2);
});

test("failed index growth preserves retained values and original errors while cleaning new roots", () => {
  const [items, set] = createSignal([0]);
  const disposed: number[] = [];
  const failure = new Error("mapper");
  let mapped!: () => Array<() => number>;
  const stop = createRoot((dispose) => {
    mapped = indexArray(items, (item, index) => {
      onCleanup(() => {
        disposed.push(index);
        if (index > 0) throw Error("cleanup");
      });
      if (index === 2) throw failure;
      return item;
    });
    return dispose;
  });
  const original = mapped()[0]!;
  expect(() => set([9, 1, 2])).toThrow(failure);
  expect(original()).toBe(0);
  expect(disposed).toEqual([2, 1]);
  set([4]);
  expect(mapped()[0]).toBe(original);
  expect(original()).toBe(4);
  stop();
  expect(disposed).toEqual([2, 1, 0]);
});

test("index shrink finishes all cleanup and recovers after a cleanup failure", () => {
  const [items, set] = createSignal([0, 1, 2]);
  const disposed: number[] = [];
  let mapped!: () => Array<() => number>;
  const stop = createRoot((dispose) => {
    mapped = indexArray(items, (item, index) => {
      onCleanup(() => {
        disposed.push(index);
        if (index === 1) throw Error("cleanup");
      });
      return item;
    });
    return dispose;
  });
  expect(() => set([3])).toThrow("cleanup");
  expect(disposed).toEqual([1, 2]);
  expect(mapped()).toHaveLength(1);
  expect(mapped()[0]!()).toBe(3);
  stop();
  expect(disposed).toEqual([1, 2, 0]);
});

test("indexed primitive editing preserves input focus and caret", async () => {
  await import("../../react/test/dom");
  const { h, render } = await import("../src/dom");
  const container = document.createElement("main");
  document.body.append(container);
  const [items, set] = createSignal(["a", "b"]);
  let created = 0;
  const stop = render(
    () =>
      Index({
        each: items,
        children: (item, index) => {
          created++;
          return h("input", {
            value: item,
            onInput: (event: Event) =>
              set((values) =>
                values.map((value, i) =>
                  i === index
                    ? (event.target as HTMLInputElement).value
                    : value,
                ),
              ),
          });
        },
      }),
    container,
  );
  try {
    const input = container.querySelector("input")!;
    input.focus();
    input.value = "ax";
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(items()).toEqual(["ax", "b"]);
    expect(created).toBe(2);
    expect(container.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
  } finally {
    stop();
    container.remove();
  }
});

test("Switch chooses first truthy Match, retains owner across value changes and disposes branches", () => {
  const [first, setFirst] = createSignal<string | false>(false),
    [second, setSecond] = createSignal<string | false>("second");
  const created: string[] = [],
    disposed: string[] = [];
  let stale!: () => string;
  let read!: () => () => string;
  const stop = createRoot((dispose) => {
    const a = Match({
      when: first,
      children: (value) => {
        created.push("first");
        onCleanup(() => disposed.push("first"));
        return () => value();
      },
    });
    const b = Match({
      when: second,
      children: (value) => {
        created.push("second");
        onCleanup(() => disposed.push("second"));
        stale = value;
        return () => value();
      },
    });
    read = Switch({
      children: () => [a, b],
      fallback: () => {
        created.push("fallback");
        onCleanup(() => disposed.push("fallback"));
        return () => "fallback";
      },
    }) as () => () => string;
    return dispose;
  });
  expect(read()()).toBe("second");
  const retained = read();
  setSecond("updated");
  expect(read()).toBe(retained);
  expect(read()()).toBe("updated");
  expect(created).toEqual(["second"]);
  setFirst("first");
  expect(read()()).toBe("first");
  expect(disposed).toEqual(["second"]);
  expect(() => stale()).toThrow("inactive");
  setSecond(false);
  expect(read()()).toBe("first");
  setFirst(false);
  expect(read()()).toBe("fallback");
  expect(disposed).toEqual(["second", "first"]);
  stop();
  expect(disposed).toEqual(["second", "first", "fallback"]);
});

test("Switch follows dynamic order, releases failed branch ownership and renders generic SSR children", async () => {
  const { h, renderToString } = await import("../src/ssr");
  const [reverse, setReverse] = createSignal(false);
  let creations = 0,
    cleanups = 0;
  const stop = createRoot((dispose) => {
    const a = Match({
        when: () => true,
        children: () => {
          creations++;
          onCleanup(() => cleanups++);
          return h("span", null, "a");
        },
      }),
      b = Match({
        when: () => true,
        children: () => {
          creations++;
          onCleanup(() => cleanups++);
          return h("span", null, "b");
        },
      });
    const view = Switch({ children: () => (reverse() ? [b, a] : [a, b]) });
    expect(renderToString(() => view())).toBe("<span>a</span>");
    setReverse(true);
    expect(renderToString(() => view())).toBe("<span>b</span>");
    return dispose;
  });
  stop();
  expect([creations, cleanups]).toEqual([2, 2]);
  let failedCleanup = 0;
  expect(() =>
    createRoot(() =>
      Switch({
        children: () => [
          Match({
            when: () => true,
            children: () => {
              onCleanup(() => failedCleanup++);
              throw new Error("branch failure");
            },
          }),
        ],
      }),
    ),
  ).toThrow("branch failure");
  expect(failedCleanup).toBe(1);
});

test("Solid-shaped native adapters read getter props lazily and retain conditional/list branches", async () => {
  const api = await import("../../adapter-solid/src/solid");
  const [items, setItems] = createSignal(["a"]),
    [shown, setShown] = createSignal<string | false>("yes");
  let fallbackReads = 0,
    childReads = 0;
  let read!: () => unknown;
  const stop = createRoot((dispose) => {
    const list = api.For({
      get each() {
        return items();
      },
      children: (item) => item,
      get fallback() {
        fallbackReads++;
        return "empty";
      },
    });
    expect(list()).toEqual(["a"]);
    expect(fallbackReads).toBe(0);
    setItems(["a", "b"]);
    expect(list()).toEqual(["a", "b"]);
    setItems([]);
    expect(list()).toBe("empty");
    expect(fallbackReads).toBe(1);
    read = api.Show({
      get when() {
        return shown();
      },
      get children() {
        childReads++;
        return (value: () => string) => value;
      },
      fallback: "off",
    });
    expect((read() as () => string)()).toBe("yes");
    setShown("updated");
    expect((read() as () => string)()).toBe("updated");
    expect(childReads).toBe(1);
    setShown(false);
    expect(read()).toBe("off");
    return dispose;
  });
  stop();
  const keyed = api.Show({
    when: true,
    children: (value) => value,
    keyed: true,
  });
  expect(keyed()).toBe(true);
});

test("Solid-shaped Switch and Index preserve getter values and zero-argument child accessors", async () => {
  const api = await import("../../adapter-solid/src/solid");
  const [value, setValue] = createSignal("a"),
    [visible, setVisible] = createSignal(false);
  let childReads = 0;
  const stop = createRoot((dispose) => {
    const indexed = api.Index({
      get each() {
        return [value()];
      },
      children: (item) => item,
    });
    const item = (indexed() as Array<() => string>)[0]!;
    setValue("b");
    expect((indexed() as Array<() => string>)[0]).toBe(item);
    expect(item()).toBe("b");
    const branch = api.Match({
      get when() {
        return visible();
      },
      get children() {
        childReads++;
        return () => value();
      },
    });
    const view = api.Switch({ children: [branch], fallback: "none" });
    expect(view()).toBe("none");
    expect(childReads).toBe(0);
    setVisible(true);
    expect((view() as () => string)()).toBe("b");
    setValue("c");
    expect((view() as () => string)()).toBe("c");
    expect(childReads).toBe(1);
    return dispose;
  });
  stop();
});

test("getter-constructed Solid Match retains its owner when only its condition value changes", async () => {
  const api = await import("../../adapter-solid/src/solid");
  const [value, setValue] = createSignal<number | false>(1);
  let mounts = 0,
    cleanups = 0,
    descriptors = 0;
  let read!: () => unknown;
  const stop = createRoot((dispose) => {
    read = api.Switch({
      get children() {
        descriptors++;
        return api.Match({
          get when() {
            return value();
          },
          children: (current: () => number) => {
            mounts++;
            onCleanup(() => cleanups++);
            return { current };
          },
        });
      },
      fallback: "none",
    });
    return dispose;
  });
  const retained = read() as { current: () => number };
  expect(retained.current()).toBe(1);
  setValue(2);
  expect(read()).toBe(retained);
  expect(retained.current()).toBe(2);
  expect([mounts, cleanups, descriptors]).toEqual([1, 0, 1]);
  setValue(false);
  expect(read()).toBe("none");
  expect(cleanups).toBe(1);
  setValue(3);
  expect((read() as { current: () => number }).current()).toBe(3);
  expect([mounts, descriptors]).toEqual([2, 1]);
  stop();
  expect(cleanups).toBe(2);
});

test("Switch disposes DOM branch accessors before false and priority transitions propagate", async () => {
  await import("../../react/test/dom");
  const { h, render } = await import("../src/dom");
  const [first, setFirst] = createSignal<string | false>(false),
    [second, setSecond] = createSignal<string | false>("second");
  const cleaned: string[] = [];
  const container = document.createElement("main");
  document.body.append(container);
  const stop = render(
    () =>
      Switch({
        children: () => [
          Match({
            when: first,
            children: (value) => {
              onCleanup(() => cleaned.push("first"));
              return h("strong", null, () => value());
            },
          }),
          Match({
            when: second,
            children: (value) => {
              onCleanup(() => cleaned.push("second"));
              return h("span", null, () => value());
            },
          }),
        ],
        fallback: () => h("p", null, "none"),
      }),
    container,
  );
  expect(container.textContent).toBe("second");
  setSecond("updated");
  expect(container.textContent).toBe("updated");
  expect(() => setFirst("first")).not.toThrow();
  expect(container.textContent).toBe("first");
  expect(cleaned).toEqual(["second"]);
  expect(() => setFirst(false)).not.toThrow();
  expect(container.textContent).toBe("updated");
  expect(cleaned).toEqual(["second", "first"]);
  expect(() => setSecond(false)).not.toThrow();
  expect(container.textContent).toBe("none");
  expect(cleaned).toEqual(["second", "first", "second"]);
  stop();
  container.remove();
});

test("disposing a list owner during mapping cleans uncommitted roots and prevents resurrection", () => {
  for (const kind of ["keyed", "indexed"]) {
    const [source, set] = createSignal(0),
      [items, setItems] = createSignal([1, 2]);
    let runs = 0,
      cleanups = 0,
      mapped = 0;
    let read!: () => number[];
    createRoot((stop) => {
      const mapper = () => {
        mapped++;
        onCleanup(() => cleanups++);
        createComputed(() => {
          source();
          runs++;
        });
        stop();
        return 1;
      };
      read =
        kind === "keyed" ? mapArray(items, mapper) : indexArray(items, mapper);
    });
    expect([mapped, cleanups, runs]).toEqual([1, 1, 1]);
    expect(read()).toEqual([]);
    set(1);
    setItems([3, 4]);
    expect(read()).toEqual([]);
    expect([mapped, cleanups, runs]).toEqual([1, 1, 1]);
  }
});

test("Show and Switch dispose branches created while their owner is being disposed", () => {
  for (const kind of ["show", "switch"]) {
    const [source, set] = createSignal(0);
    let runs = 0,
      cleanups = 0;
    let read!: () => number | undefined;
    createRoot((stop) => {
      const children = () => {
        onCleanup(() => cleanups++);
        createComputed(() => {
          source();
          runs++;
        });
        stop();
        return 1;
      };
      read =
        kind === "show"
          ? Show({ when: () => true, children })
          : Switch({ children: () => [Match({ when: () => true, children })] });
    });
    expect(read()).toBeUndefined();
    set(1);
    expect(read()).toBeUndefined();
    expect([cleanups, runs]).toEqual([1, 1]);
  }
});

test("mapper errors remain original when owner cancellation and cleanup also fail", () => {
  const failure = new Error("mapper failure");
  for (const kind of ["keyed", "indexed"]) {
    let cleanups = 0;
    expect(() =>
      createRoot((stop) => {
        const mapper = () => {
          onCleanup(() => {
            cleanups++;
            throw new Error("cleanup failure");
          });
          stop();
          throw failure;
        };
        if (kind === "keyed") mapArray(() => [1], mapper);
        else indexArray(() => [1], mapper);
      }),
    ).toThrow(failure);
    expect(cleanups).toBe(1);
  }
});

test("Show and Switch do not construct children after source accessors dispose their owner", () => {
  for (const kind of ["show", "switch"]) {
    let creations = 0;
    let read!: () => number | undefined;
    createRoot((stop) => {
      const children = () => {
        creations++;
        return 1;
      };
      read =
        kind === "show"
          ? Show({
              when: () => {
                stop();
                return true;
              },
              children,
            })
          : Switch({
              children: () => {
                stop();
                return [Match({ when: () => true, children })];
              },
            });
    });
    expect(read()).toBeUndefined();
    expect(creations).toBe(0);
  }
});

test("cancellation during list growth cleans retained and new roots before subsequent writes", () => {
  for (const kind of ["keyed", "indexed"]) {
    const [items, setItems] = createSignal([1]),
      [source, setSource] = createSignal(0);
    let stop = () => {},
      runs = 0;
    const cleaned: number[] = [];
    let read!: () => number[];
    createRoot((dispose) => {
      stop = dispose;
      const mapper = (item: number | (() => number)) => {
        const value = typeof item === "function" ? item() : item;
        onCleanup(() => cleaned.push(value));
        createComputed(() => {
          source();
          runs++;
        });
        if (value === 2) stop();
        return value;
      };
      read =
        kind === "keyed" ? mapArray(items, mapper) : indexArray(items, mapper);
    });
    setItems([1, 2, 3]);
    expect(read()).toEqual([]);
    expect(cleaned).toEqual([1, 2]);
    expect(runs).toBe(2);
    setSource(1);
    setItems([4]);
    expect(read()).toEqual([]);
    expect(runs).toBe(2);
    stop();
    expect(cleaned).toEqual([1, 2]);
  }
});

test("old branch cleanup that disposes the owner prevents replacement setup", () => {
  for (const kind of ["show", "switch"]) {
    const [visible, setVisible] = createSignal(true);
    let replacements = 0;
    let read!: () => string | undefined;
    createRoot((stop) => {
      const children = () => {
          onCleanup(stop);
          return "first";
        },
        fallback = () => {
          replacements++;
          return "replacement";
        };
      read =
        kind === "show"
          ? Show({ when: visible, children, fallback })
          : Switch({
              children: () => [Match({ when: visible, children })],
              fallback,
            });
    });
    setVisible(false);
    expect(read()).toBeUndefined();
    expect(replacements).toBe(0);
  }
});

test("removed item cleanup that disposes the owner cannot publish disposed retained rows", () => {
  for (const kind of ["keyed", "indexed"]) {
    const [items, setItems] = createSignal([1, 2]);
    let read!: () => number[];
    const cleaned: number[] = [];
    createRoot((stop) => {
      const mapper = (item: number | (() => number)) => {
        const value = typeof item === "function" ? item() : item;
        onCleanup(() => {
          cleaned.push(value);
          if (value === 2) stop();
        });
        return value;
      };
      read =
        kind === "keyed" ? mapArray(items, mapper) : indexArray(items, mapper);
    });
    setItems([1]);
    expect(read()).toEqual([]);
    expect(cleaned).toEqual([2, 1]);
    setItems([3]);
    expect(read()).toEqual([]);
  }
});

test("retained item/index updates that dispose the owner cannot publish disposed output", () => {
  const [items, setItems] = createSignal(["a", "b"]);
  let keyed!: () => string[];
  createRoot((stop) => {
    keyed = mapArray(items, (item, index) => {
      createComputed(() => {
        if (item === "a" && index() === 1) stop();
      });
      return item;
    });
  });
  setItems(["b", "a"]);
  expect(keyed()).toEqual([]);
  const [values, setValues] = createSignal([1]);
  let indexed!: () => number[];
  createRoot((stop) => {
    indexed = indexArray(values, (item) => {
      createComputed(() => {
        if (item() === 2) stop();
      });
      return 1;
    });
  });
  setValues([2]);
  expect(indexed()).toEqual([]);
});
