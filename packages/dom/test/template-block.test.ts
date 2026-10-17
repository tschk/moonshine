import { test, expect } from "bun:test";
import "../../react/test/dom";
import {
  h,
  render,
  templateBlock,
  createInsertionRange,
  prepareInsertionRange,
  insertionRangeEnd,
  moveInsertionRange,
} from "../src/dom";
import {
  getOwner,
  createRoot,
  createRenderEffect,
  createSignal,
  onCleanup,
  onAfterDispose,
} from "../src/reactive";
import { withRuneScheduler } from "../../adapter-svelte/src/pre";
import { keyedEach } from "../../adapter-svelte/src/each";
import { tick } from "../../adapter-svelte/src/svelte";

test("whole block retains detached descendants but stops effects and listeners", () => {
  const host = document.createElement("div");
  document.body.append(host);
  let root!: HTMLElement, child!: HTMLElement;
  let set!: (v: number) => unknown;
  let runs = 0,
    clicks = 0;
  const trace: unknown[] = [];
  const stop = render(
    () =>
      templateBlock((retain) => {
        const [n, write] = createSignal(0);
        set = write;
        root = h("div", {});
        child = h("button", { onClick: () => clicks++ });
        const text = document.createTextNode("");
        child.append(text);
        const range = createInsertionRange(child, undefined, retain);
        prepareInsertionRange(range);
        const anchor = document.createComment("");
        root.append(anchor);
        moveInsertionRange(range, anchor);
        createRenderEffect(() => {
          runs++;
          text.data = String(n());
        });
        onAfterDispose(() =>
          trace.push([
            root.isConnected,
            root.textContent,
            child.parentNode === root,
          ]),
        );
        return root;
      }),
    host,
  );
  child.click();
  expect(clicks).toBe(1);
  set(1);
  stop();
  expect(trace).toEqual([[false, "1", true]]);
  expect(host.childNodes.length).toBe(0);
  set(2);
  child.click();
  expect(runs).toBe(2);
  expect(clicks).toBe(1);
  host.remove();
});

test("active keyed removal still detaches row while outer disposal retains survivors", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  let root!: HTMLElement;
  let set!: (v: string[]) => unknown;
  const rows = new Map<string, HTMLElement>();
  const trace: unknown[] = [];
  const stop = render(
    () =>
      withRuneScheduler(() =>
        templateBlock((retain) => {
          const [items, write] = createSignal(["a", "b"]);
          set = write;
          root = h("div", {}, () =>
            keyedEach(
              items,
              (x) => x,
              (item) =>
                templateBlock(() => {
                  const node = h("i", {});
                  node.append(document.createTextNode(item()));
                  rows.set(item(), node);
                  onAfterDispose(() =>
                    trace.push([item(), node.isConnected, node.textContent]),
                  );
                  return node;
                }),
              undefined,
              retain,
            ),
          );
          onAfterDispose(() => trace.push(["parent", root.textContent]));
          return root;
        }),
      ),
    host,
  );
  set(["b"]);
  await tick();
  expect(root.contains(rows.get("a")!)).toBe(false);
  expect(root.textContent).toBe("b");
  expect(trace).toEqual([["a", false, "a"]]);
  stop();
  expect(trace).toEqual([
    ["a", false, "a"],
    ["b", false, "b"],
    ["parent", "b"],
  ]);
  expect(rows.get("b")!.parentNode).toBe(root);
  host.remove();
});

test("moved-out owned nodes remove normally and foreign nodes remain untouched", () => {
  const host = document.createElement("div"),
    outside = document.createElement("div");
  document.body.append(host, outside);
  let child!: HTMLElement;
  const stop = render(
    () =>
      templateBlock((retain) => {
        const root = h("div", {});
        child = h("i", {});
        child.append(document.createTextNode("owned"));
        const range = createInsertionRange(child, undefined, retain);
        prepareInsertionRange(range);
        const anchor = document.createComment("");
        root.append(anchor);
        moveInsertionRange(range, anchor);
        return root;
      }),
    host,
  );
  outside.append(child);
  const foreign = h("b", {});
  outside.append(foreign);
  stop();
  expect(child.parentNode).toBeNull();
  expect(outside.firstChild).toBe(foreign);
  host.remove();
  outside.remove();
});

test("intentionally detached host follows active removal and whole-block retention", async () => {
  const host = document.createElement("div");
  let set!: (v: string[]) => unknown;
  let root!: HTMLElement;
  const stop = render(
    () =>
      withRuneScheduler(() =>
        templateBlock((retain) => {
          const [items, write] = createSignal(["a", "b"]);
          set = write;
          root = h("div", {}, () =>
            keyedEach(
              items,
              (x) => x,
              (item) => {
                const node = h("i", {});
                node.append(document.createTextNode(item()));
                return node;
              },
              undefined,
              retain,
            ),
          );
          return root;
        }),
      ),
    host,
  );
  expect(host.isConnected).toBe(false);
  set(["b"]);
  await tick();
  expect(root.textContent).toBe("b");
  stop();
  expect(host.childNodes.length).toBe(0);
  expect(root.textContent).toBe("b");
});

test("damaged root range captures only owned ledger and canceled ranges cannot move", () => {
  const host = document.createElement("div");
  document.body.append(host);
  let range!: Node;
  let child!: HTMLElement;
  const stop = render(
    () =>
      templateBlock((retain) => {
        child = h("i", {});
        child.append(document.createTextNode("owned"));
        range = createInsertionRange(child, undefined, retain);
        prepareInsertionRange(range);
        return range;
      }),
    host,
  );
  const foreign = document.createElement("b");
  host.insertBefore(foreign, insertionRangeEnd(range));
  stop();
  expect(host.childNodes.length).toBe(1);
  expect(host.firstChild).toBe(foreign);
  expect(child.textContent).toBe("owned");
  expect(() => moveInsertionRange(range, foreign)).toThrow(
    "Invalid insertion range boundaries",
  );
  host.remove();
});

test("failed build releases ranges and preserves setup error over failing cleanup", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const first = Error("build"),
    secondary = Error("cleanup");
  let cleaned = 0;
  expect(() =>
    render(
      () =>
        templateBlock((retain) => {
          const range = createInsertionRange(h("i", {}), undefined, retain);
          prepareInsertionRange(range);
          onCleanup(() => {
            cleaned++;
            throw secondary;
          });
          throw first;
        }),
      host,
    ),
  ).toThrow(first);
  expect(cleaned).toBe(1);
  expect(host.childNodes.length).toBe(0);
  host.remove();
});

test("teardown errors drain peers while detached content remains observable", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const first = Error("first"),
    last = Error("last");
  const trace: unknown[] = [];
  let root!: HTMLElement;
  const stop = render(
    () =>
      templateBlock(() => {
        root = h("div", {});
        root.append(document.createTextNode("retained"));
        onCleanup(() => {
          trace.push("first");
          throw first;
        });
        onCleanup(() => trace.push("peer"));
        onAfterDispose(() => {
          trace.push(root.textContent);
          throw last;
        });
        onAfterDispose(() => trace.push("after-peer"));
        return root;
      }),
    host,
  );
  expect(stop).toThrow(first);
  expect(trace).toEqual(["first", "peer", "retained", "after-peer"]);
  expect(host.childNodes.length).toBe(0);
  stop();
  host.remove();
});

test("reentrant owner disposal during construction never appends late DOM", () => {
  const host = document.createElement("div");
  document.body.append(host);
  let cleaned = 0;
  let scope!: NonNullable<ReturnType<typeof getOwner>>;
  expect(() =>
    render(
      () =>
        withRuneScheduler(() =>
          createRoot((dispose) =>
            templateBlock(() => {
              scope = getOwner()!;
              const node = h("i", {});
              onCleanup(() => cleaned++);
              dispose();
              return node;
            }),
          ),
        ),
      host,
    ),
  ).toThrow("Template block disposed during construction");
  expect(cleaned).toBe(1);
  expect(scope.context).toBeUndefined();
  expect(host.childNodes.length).toBe(0);
  host.remove();
});

test("nested range stop failures drain sibling resources without stripping retained descendants", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const trace: unknown[] = [];
  const first = Error("range-first");
  let root!: HTMLElement;
  const stop = render(
    () =>
      templateBlock((retain) => {
        root = h("div", {});
        for (const name of ["a", "b"]) {
          const child = h("i", {});
          child.append(document.createTextNode(name));
          const range = createInsertionRange(
            () => {
              onCleanup(() => {
                trace.push(name);
                if (name === "a") throw first;
              });
              return child;
            },
            undefined,
            retain,
          );
          prepareInsertionRange(range);
          const anchor = document.createComment("");
          root.append(anchor);
          moveInsertionRange(range, anchor);
        }
        onAfterDispose(() => trace.push(root.textContent));
        return root;
      }),
    host,
  );
  expect(stop).toThrow(first);
  expect(trace).toEqual(["a", "b", "ab"]);
  expect(root.textContent).toBe("ab");
  expect(host.childNodes.length).toBe(0);
  host.remove();
});

test("context restores after failing build and helper rejects ownerless use", () => {
  expect(() => templateBlock(() => document.createTextNode("x"))).toThrow(
    "live owner",
  );
  const first = Error("setup");
  createRoot((stop) => {
    const owner = getOwner()!;
    const context = owner.context;
    expect(() =>
      templateBlock(() => {
        throw first;
      }),
    ).toThrow(first);
    expect(owner.context).toBe(context);
    stop();
  });
});

test("stop during a range read preserves retained current nodes but removes moved-out and fresh nodes", () => {
  for (const kind of ["retained", "moved", "fresh"] as const) {
    const host = document.createElement("div"),
      outside = document.createElement("div");
    document.body.append(host, outside);
    let stop!: () => void;
    let set!: (value: number) => unknown;
    let root!: HTMLElement;
    let child!: HTMLElement;
    let fresh: HTMLElement | undefined;
    stop = render(
      () =>
        templateBlock((retain) => {
          const [n, write] = createSignal(0);
          set = write;
          root = h("div", {});
          child = h("i", {});
          child.append(document.createTextNode("owned"));
          const range = createInsertionRange(
            () => {
              if (n()) {
                if (kind === "moved") outside.append(child);
                if (kind === "fresh") {
                  fresh = h("b", {});
                  outside.append(fresh);
                }
                stop();
                return fresh ?? child;
              }
              return child;
            },
            undefined,
            retain,
          );
          prepareInsertionRange(range);
          const anchor = document.createComment("");
          root.append(anchor);
          moveInsertionRange(range, anchor);
          return root;
        }),
      host,
    );
    set(1);
    expect(host.childNodes.length).toBe(0);
    expect(root.textContent).toBe(kind === "moved" ? "" : "owned");
    expect(child.parentNode).toBe(kind === "moved" ? null : root);
    expect(fresh?.parentNode ?? null).toBeNull();
    expect(outside.childNodes.length).toBe(0);
    stop();
    host.remove();
    outside.remove();
  }
});

test("stop during removed-range cleanup preserves retained next nodes and disposes metadata once", () => {
  const host = document.createElement("div");
  document.body.append(host);
  let stop!: () => void;
  let set!: (value: number) => unknown;
  let root!: HTMLElement;
  let retained!: HTMLElement;
  let cleaned = 0;
  stop = render(
    () =>
      templateBlock((retain) => {
        const [n, write] = createSignal(0);
        set = write;
        root = h("div", {});
        retained = h("i", {});
        retained.append(document.createTextNode("retained"));
        const old = createInsertionRange(
          () => {
            onCleanup(() => {
              cleaned++;
              stop();
            });
            return h("b", {});
          },
          undefined,
          retain,
        );
        prepareInsertionRange(old);
        const range = createInsertionRange(
          () => (n() ? [retained] : [old, retained]),
          undefined,
          retain,
        );
        prepareInsertionRange(range);
        const anchor = document.createComment("");
        root.append(anchor);
        moveInsertionRange(range, anchor);
        return root;
      }),
    host,
  );
  set(1);
  expect(host.childNodes.length).toBe(0);
  expect(root.textContent).toBe("retained");
  expect(retained.parentNode).toBe(root);
  expect(cleaned).toBe(1);
  stop();
  expect(cleaned).toBe(1);
  host.remove();
});

test("reentrant stop while removing old range retains later old text excluded from next", () => {
  const host = document.createElement("div");
  document.body.append(host);
  let stop!: () => void;
  let set!: (value: number) => unknown;
  let root!: HTMLElement;
  let text!: Text;
  let cleaned = 0;
  stop = render(
    () =>
      templateBlock((retain) => {
        const [n, write] = createSignal(0);
        set = write;
        root = h("div", {});
        text = document.createTextNode("old-text");
        const old = createInsertionRange(
          () => {
            onCleanup(() => {
              cleaned++;
              stop();
            });
            return h("b", {});
          },
          undefined,
          retain,
        );
        prepareInsertionRange(old);
        const range = createInsertionRange(
          () => (n() ? [] : [old, text]),
          undefined,
          retain,
        );
        prepareInsertionRange(range);
        const anchor = document.createComment("");
        root.append(anchor);
        moveInsertionRange(range, anchor);
        return root;
      }),
    host,
  );
  set(1);
  expect(host.childNodes.length).toBe(0);
  expect(root.textContent).toBe("old-text");
  expect(text.parentNode).toBe(root);
  expect(cleaned).toBe(1);
  stop();
  expect(cleaned).toBe(1);
  host.remove();
});

test("ordinary child insert inherits explicit block retention and stops owned work", () => {
  const host = document.createElement("div");
  let root!: HTMLElement;
  let write!: (value: number) => void;
  let reads = 0;
  const seen: string[] = [];
  const stop = render(
    () =>
      templateBlock(() => {
        const [value, set] = createSignal(0);
        write = set;
        root = h(
          "div",
          {},
          h("span", {}, () => {
            reads++;
            return value();
          }),
        );
        onAfterDispose(() => seen.push(root.textContent ?? ""));
        return root;
      }),
    host,
  );
  write(1);
  expect(root.textContent).toBe("1");
  stop();
  expect(root.isConnected).toBe(false);
  expect(root.textContent).toBe("1");
  expect(seen).toEqual(["1"]);
  const before = reads;
  write(2);
  expect(reads).toBe(before);
});

test("inherited retention removes moved-out ordinary children and drains failing cleanup", () => {
  const host = document.createElement("div");
  const elsewhere = document.createElement("div");
  let root!: HTMLElement, moved!: HTMLElement;
  const failure = Error("ordinary child cleanup");
  const trace: string[] = [];
  const stop = render(
    () =>
      templateBlock(() => {
        root = h(
          "div",
          {},
          h("span", {}, "kept"),
          (moved = h("i", {}, "moved")),
        );
        onCleanup(() => {
          trace.push("first");
          throw failure;
        });
        onCleanup(() => trace.push("peer"));
        return root;
      }),
    host,
  );
  elsewhere.append(moved);
  expect(() => stop()).toThrow(failure);
  expect(root.textContent).toBe("kept");
  expect(elsewhere.textContent).toBe("");
  expect(trace).toEqual(["first", "peer"]);
});

test("ordinary child ranges inherit block retention and stop updates", () => {
  const host = document.createElement("div");
  let root!: HTMLElement;
  let write!: (value: string) => void;
  const seen: string[] = [];
  const stop = render(
    () =>
      templateBlock(() => {
        const [read, set] = createSignal("first");
        write = set;
        root = h("div", {}, createInsertionRange(h("span", {}, read)));
        onAfterDispose(() => seen.push(root.textContent ?? ""));
        return root;
      }),
    host,
  );
  write("kept");
  stop();
  expect(seen).toEqual(["kept"]);
  expect(root.textContent).toBe("kept");
  write("late");
  expect(root.textContent).toBe("kept");
});
