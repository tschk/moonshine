import { expect, test, spyOn } from "bun:test";
import {
  createRoot,
  createSignal,
  createRenderEffect,
  createRenderMemo,
  getRenderScheduler,
  onCleanup,
  getOwner,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { renderSchedulerKey } from "@tschk/moonshine-dom/render-scheduler";
import { Show, mapArray } from "@tschk/moonshine-dom/control";
import { withVueScheduler, currentGroup, prepareProps } from "../src/render";
import {
  withVueScheduler as sourceScheduler,
  createDefaultProps,
} from "../src/props";
import { watch } from "../src/reactive";
import { onMounted, onUnmounted } from "../src/lifecycle";

// Capture the actual private scheduled callbacks; no production test-only exports.
function withMicrotasks(run: (flush: () => void) => void): void {
  const pending: Array<() => void> = [];
  const spy = spyOn(globalThis, "queueMicrotask").mockImplementation(
    (callback) => {
      pending.push(callback);
    },
  );
  const flush = () => {
    let failed = false,
      error: unknown;
    while (pending.length) {
      try {
        pending.shift()!();
      } catch (next) {
        if (!failed) error = next;
        failed = true;
      }
    }
    if (failed) throw error;
  };
  let failed = false,
    error: unknown;
  try {
    run(flush);
  } catch (next) {
    failed = true;
    error = next;
  } finally {
    try {
      flush();
    } catch (next) {
      if (!failed) error = next;
      failed = true;
    } finally {
      spy.mockRestore();
    }
  }
  if (failed) throw error;
}
test("post feedback shares the same drain budget and drains independent peers", () =>
  withMicrotasks((flush) => {
    const [read, set] = createSignal(0);
    const trace: string[] = [];
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      createComponent(
        () =>
          withVueScheduler(() => {
            createRenderEffect(() => {
              const value = read();
              getRenderScheduler()!.post(() => {
                if (value < 1005) set(value + 1);
              });
            });
          }),
        {},
        "dom",
      );
      createComponent(
        () =>
          withVueScheduler(() =>
            getRenderScheduler()!.post(() => trace.push("peer")),
          ),
        {},
        "dom",
      );
    });
    expect(() => flush()).toThrow("Vue post update limit exceeded");
    expect(trace).toEqual(["peer"]);
    expect(read()).toBe(1000);
    stop();
  }));

test("first error preserved while independent render and post peers drain", () =>
  withMicrotasks((flush) => {
    const [read, set] = createSignal(0);
    const trace: string[] = [];
    const first = { first: true },
      second = { second: true };
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      createComponent(
        () =>
          withVueScheduler(() =>
            createRenderEffect(() => {
              if (read()) throw first;
            }),
          ),
        {},
        "dom",
      );
      createComponent(
        () =>
          withVueScheduler(() =>
            createRenderEffect(() => {
              if (read()) {
                trace.push("render-peer");
                getRenderScheduler()!.post(() => {
                  trace.push("post-peer");
                  throw second;
                });
              }
            }),
          ),
        {},
        "dom",
      );
    });
    set(1);
    let caught: unknown;
    try {
      flush();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(first);
    expect(trace).toEqual(["render-peer", "post-peer"]);
    stop();
    flush();
  }));

test("preparation failure blocks own callbacks but independent descendant stays live and next success thaws", () =>
  withMicrotasks((flush) => {
    const [read, set] = createSignal(0);
    const trace: string[] = [];
    let group: ReturnType<typeof currentGroup>;
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() => {
        group = currentGroup();
        createRenderEffect(() => {
          trace.push("parent:" + read());
        });
        getRenderScheduler()!.component(() =>
          createRenderEffect(() => {
            trace.push("child:" + read());
          }),
        );
      });
    });
    trace.length = 0;
    expect(() =>
      prepareProps(group, () => {
        set(1);
        throw Error("factory");
      }),
    ).toThrow("factory");
    flush();
    set(2);
    flush();
    expect(trace).toEqual(["child:1", "child:2"]);
    prepareProps(group, () => {});
    flush();
    expect(trace).toEqual(["child:1", "child:2", "parent:2"]);
    stop();
  }));

test("queued child canceled by parent structure, live peer survives", () =>
  withMicrotasks((flush) => {
    const [read, set] = createSignal(0);
    const trace: string[] = [];
    let childStop!: () => void, stop!: () => void;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() => {
        getRenderScheduler()!.memo(() => {
          if (read()) childStop();
          return 0;
        }, 0);
        createRoot((dispose) => {
          childStop = dispose;
          getRenderScheduler()!.component(() => {
            onCleanup(() => trace.push("clean"));
            createRenderEffect(() => trace.push("child:" + read()));
          });
        });
        getRenderScheduler()!.component(() =>
          createRenderEffect(() => trace.push("peer:" + read())),
        );
      });
    });
    trace.length = 0;
    set(1);
    flush();
    expect(trace).toEqual(["clean", "peer:1"]);
    stop();
  }));

test("post-only feedback is bounded without dropping post peers", () =>
  withMicrotasks((flush) => {
    let stop!: () => void;
    const trace: string[] = [];
    let calls = 0;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() => {
        const scheduler = getRenderScheduler()!;
        const repeat = () => {
          calls++;
          if (calls < 1005) scheduler.post(repeat);
        };
        scheduler.post(repeat);
        scheduler.post(() => trace.push("peer"));
      });
    });
    expect(() => flush()).toThrow("Vue post update limit exceeded");
    expect(calls).toBe(1000);
    expect(trace).toEqual(["peer"]);
    stop();
  }));

test("child group posts precede parent group posts", () =>
  withMicrotasks((flush) => {
    const trace: string[] = [];
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() => {
        getRenderScheduler()!.component(() => {
          getRenderScheduler()!.post(() => trace.push("child"));
        });
        getRenderScheduler()!.post(() => trace.push("parent"));
      });
    });
    flush();
    expect(trace).toEqual(["child", "parent"]);
    stop();
    flush();
  }));

test("lifecycle mount cancellation and child-first posts retain final unmount callbacks", () =>
  withMicrotasks((flush) => {
    const trace: string[] = [];
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() =>
        createComponent(
          () => {
            onMounted(() => trace.push("parent:mount"));
            onUnmounted(() => trace.push("parent:unmount"));
            createComponent(
              () => {
                onMounted(() => trace.push("child:mount"));
                onUnmounted(() => trace.push("child:unmount"));
                return "";
              },
              {},
              "dom",
            );
            return "";
          },
          {},
          "dom",
        ),
      );
    });
    flush();
    expect(trace).toEqual(["child:mount", "parent:mount"]);
    stop();
    flush();
    expect(trace).toEqual([
      "child:mount",
      "parent:mount",
      "child:unmount",
      "parent:unmount",
    ]);
    trace.length = 0;
    createRoot((d) => {
      withVueScheduler(() =>
        createComponent(
          () => {
            onMounted(() => trace.push("canceled:mount"));
            onUnmounted(() => trace.push("canceled:unmount"));
            return "";
          },
          {},
          "dom",
        ),
      );
      d();
    });
    flush();
    expect(trace).toEqual(["canceled:unmount"]);
  }));

test("fresh post closures cannot evade a group feedback budget; unrelated peers drain", () =>
  withMicrotasks((flush) => {
    let stop!: () => void;
    let calls = 0;
    const trace: string[] = [];
    createRoot((d) => {
      stop = d;
      createComponent(
        () =>
          withVueScheduler(() => {
            const scheduler = getRenderScheduler()!;
            const schedule = () =>
              scheduler.post(() => {
                calls++;
                if (calls < 2005) schedule();
              });
            schedule();
            scheduler.post(() => trace.push("same-group-peer"));
          }),
        {},
        "dom",
      );
      createComponent(
        () =>
          withVueScheduler(() =>
            getRenderScheduler()!.post(() => trace.push("independent-peer")),
          ),
        {},
        "dom",
      );
    });
    expect(() => flush()).toThrow("Vue post update limit exceeded");
    expect(calls).toBe(1000);
    expect(trace).toEqual(["same-group-peer", "independent-peer"]);
    stop();
  }));

test("a legitimate group batch of distinct post peers does not consume feedback waves", () =>
  withMicrotasks((flush) => {
    let stop!: () => void;
    let calls = 0;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() => {
        const scheduler = getRenderScheduler()!;
        for (let i = 0; i < 1500; i++)
          scheduler.post(() => {
            calls++;
          });
      });
    });
    flush();
    expect(calls).toBe(1500);
    stop();
  }));

test("optional groups coalesce pre/structural/render and post while ordinary native remains synchronous", () =>
  withMicrotasks((flush) => {
    const trace: string[] = [];
    const [read, set] = createSignal(0);
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() => {
        getRenderScheduler()!.pre(() => {
          trace.push("pre" + read());
        });
        createRenderMemo(() => {
          trace.push("structural" + read());
          return read();
        });
        createRenderEffect(() => {
          trace.push("render" + read());
          getRenderScheduler()!.post(() => trace.push("post" + read()));
        });
      });
    });
    flush();
    expect(trace).toEqual(["pre0", "structural0", "render0", "post0"]);
    trace.length = 0;
    set(1);
    set(2);
    expect(trace).toEqual([]);
    flush();
    expect(trace).toEqual(["pre2", "structural2", "render2", "post2"]);
    stop();
    set(3);
    flush();
    expect(trace).toHaveLength(4);
    let ordinary = 0;
    createRoot((d) => {
      createRenderEffect(() => {
        ordinary = read();
      });
      set(4);
      expect(ordinary).toBe(4);
      d();
    });
  }));

test("dynamic branch disposal cancels queued independent child without canceling surviving child", () =>
  withMicrotasks((flush) => {
    const [shown, show] = createSignal(true),
      [read, set] = createSignal(0);
    const trace: string[] = [];
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() =>
        createComponent(
          () => {
            Show({
              when: shown,
              children: () =>
                createComponent(
                  () => {
                    onCleanup(() => trace.push("clean:hidden"));
                    createRenderEffect(() => {
                      trace.push("hidden:" + read());
                    });
                    return "";
                  },
                  {},
                  "dom",
                ),
            });
            createComponent(
              () => {
                onCleanup(() => trace.push("clean:live"));
                createRenderEffect(() => {
                  trace.push("live:" + read());
                });
                return "";
              },
              {},
              "dom",
            );
          },
          {},
          "dom",
        ),
      );
    });
    trace.length = 0;
    set(1);
    show(false);
    flush();
    expect(trace).toEqual(["clean:hidden", "live:1"]);
    stop();
    set(2);
    flush();
    expect(trace).toEqual(["clean:hidden", "live:1", "clean:live"]);
  }));

test("retained list branch order and local setup survive reordering; queued work is canceled at disposal", () =>
  withMicrotasks((flush) => {
    const [list, write] = createSignal<readonly number[]>([1, 2]);
    const [read, set] = createSignal(0);
    const trace: string[] = [],
      setup: number[] = [];
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      withVueScheduler(() => {
        mapArray(list, (item, index) => {
          setup.push(item);
          onCleanup(() => trace.push("clean" + item));
          createRenderEffect(() => {
            trace.push(item + ":" + index() + ":" + read());
          });
          return item;
        });
      });
    });
    trace.length = 0;
    write([2, 1]);
    flush();
    expect(setup).toEqual([1, 2]);
    expect(trace).toEqual(["2:0:0", "1:1:0"]);
    trace.length = 0;
    set(1);
    flush();
    expect(trace).toEqual(["2:0:1", "1:1:1"]);
    trace.length = 0;
    set(2);
    stop();
    flush();
    expect(trace).toEqual(["clean2", "clean1"]);
  }));

test("two authored wrappers reuse component-created child group and preserve phase ancestry", () =>
  withMicrotasks((flush) => {
    const trace: string[] = [];
    const [read, set] = createSignal(0);
    let stop!: () => void;
    const groups: unknown[] = [];
    const Child = () =>
      withVueScheduler(() => {
        groups.push(currentGroup());
        getRenderScheduler()!.pre(() => {
          trace.push("child:pre" + read());
        });
        createRenderEffect(() => {
          trace.push("child:render" + read());
        });
        getRenderScheduler()!.post(() => trace.push("child:post"));
        onCleanup(() => trace.push("child:stop"));
        return "";
      });
    const Parent = () =>
      withVueScheduler(() => {
        groups.push(currentGroup());
        getRenderScheduler()!.pre(() => {
          trace.push("parent:pre" + read());
        });
        createRenderEffect(() => {
          trace.push("parent:render" + read());
        });
        getRenderScheduler()!.post(() => trace.push("parent:post"));
        createComponent(
          () => {
            const allocated = currentGroup();
            const result = Child();
            expect(currentGroup()).toBe(allocated);
            return result;
          },
          {},
          "dom",
        );
        onCleanup(() => trace.push("parent:stop"));
        return "";
      });
    createRoot((d) => {
      stop = d;
      createComponent(Parent, {}, "dom");
    });
    flush();
    expect(trace).toEqual([
      "parent:pre0",
      "parent:render0",
      "child:pre0",
      "child:render0",
      "child:post",
      "parent:post",
    ]);
    expect(groups[0]).not.toBe(groups[1]);
    trace.length = 0;
    set(1);
    flush();
    expect(trace).toEqual([
      "parent:pre1",
      "parent:render1",
      "child:pre1",
      "child:render1",
    ]);
    stop();
    expect(trace.slice(-2)).toEqual(["child:stop", "parent:stop"]);
  }));

test("nested wrappers keep failed parent group frozen while independent descendant updates and recovery thaws once", () =>
  withMicrotasks((flush) => {
    const trace: string[] = [];
    const [read, set] = createSignal(0);
    let stop!: () => void, parent: ReturnType<typeof currentGroup>;
    const Child = () =>
      withVueScheduler(() => {
        createRenderEffect(() => trace.push("child:" + read()));
        onCleanup(() => trace.push("child:stop"));
        return "";
      });
    const Parent = () =>
      withVueScheduler(() => {
        parent = currentGroup();
        createRenderEffect(() => trace.push("parent:" + read()));
        createComponent(Child, {}, "dom");
        onCleanup(() => trace.push("parent:stop"));
        return "";
      });
    createRoot((d) => {
      stop = d;
      createComponent(Parent, {}, "dom");
    });
    trace.length = 0;
    expect(() =>
      prepareProps(parent, () => {
        set(1);
        throw Error("factory");
      }),
    ).toThrow("factory");
    flush();
    set(2);
    flush();
    expect(trace).toEqual(["child:1", "child:2"]);
    prepareProps(parent, () => {});
    flush();
    expect(trace).toEqual(["child:1", "child:2", "parent:2"]);
    stop();
    set(3);
    flush();
    expect(trace.slice(-2)).toEqual(["child:stop", "parent:stop"]);
  }));

test("a generic carrier without Vue group metadata does not bypass installation; disposed retained owner still rejects", () =>
  withMicrotasks(() => {
    let foreign!: ReturnType<typeof getRenderScheduler>;
    let dead!: ReturnType<
      typeof import("@tschk/moonshine-dom/reactive").getOwner
    >;
    let first: unknown;
    createRoot((stop) => {
      withVueScheduler(() => {
        foreign = getRenderScheduler();
        first = currentGroup();
      });
      stop();
    });
    createRoot((stop) => {
      const owner = getOwner()!;
      owner.context = new Map([[renderSchedulerKey, foreign]]);
      withVueScheduler(() => {
        expect(currentGroup()).toBeDefined();
        expect(currentGroup()).not.toBe(first);
        expect(getRenderScheduler()).not.toBe(foreign);
      });
      dead = owner;
      stop();
    });
    expect(() => runWithOwner(dead, () => withVueScheduler(() => {}))).toThrow(
      "live owner",
    );
  }));

test("inherited Vue group cannot impersonate a replaced foreign carrier", () =>
  withMicrotasks(() => {
    createRoot((stop) => {
      withVueScheduler(() => {
        const inherited = currentGroup(),
          actual = getRenderScheduler()!;
        const { effect, memo, component, pre, post, branch, reorder } = actual;
        const foreign = { effect, memo, component, pre, post, branch, reorder };
        const owner = getOwner()!;
        owner.context = new Map(owner.context);
        owner.context.set(renderSchedulerKey, foreign);
        withVueScheduler(() => {
          expect(currentGroup()).not.toBe(inherited);
          expect(getRenderScheduler()).not.toBe(foreign);
        });
      });
      stop();
    });
  }));

test("same optional props entry carries authored nested wrappers without duplicate component carrier", () =>
  withMicrotasks((flush) => {
    const trace: string[] = [];
    let stop!: () => void;
    createRoot((d) => {
      stop = d;
      createComponent(
        () =>
          sourceScheduler(() => {
            createRenderEffect(() => trace.push("parent"));
            getRenderScheduler()!.post(() => trace.push("parent:post"));
            createComponent(
              () =>
                sourceScheduler(() => {
                  const scheduler = getRenderScheduler();
                  sourceScheduler(() =>
                    expect(getRenderScheduler()).toBe(scheduler),
                  );
                  createRenderEffect(() => trace.push("child"));
                  getRenderScheduler()!.post(() => trace.push("child:post"));
                  return "";
                }),
              {},
              "dom",
            );
            return "";
          }),
        {},
        "dom",
      );
    });
    flush();
    expect(trace).toEqual(["parent", "child", "child:post", "parent:post"]);
    stop();
  }));
test("default factories keep stable raw identity, cache per instance and do not notify raw-mutated prop watchers", () =>
  withMicrotasks((flush) => {
    const [read, set] = createSignal<number | undefined>(9);
    const calls: unknown[] = [];
    let raw: Record<PropertyKey, unknown> | undefined, stop!: () => void;
    let props!: Readonly<{ count?: number; other?: number; label: string }>;
    createRoot((dispose) => {
      stop = dispose;
      createComponent(
        () =>
          sourceScheduler(() => {
            props = createDefaultProps(
              {
                get count() {
                  return read();
                },
                get other() {
                  return read();
                },
                label: "plain",
              },
              ["count", "label", "other"],
              [],
              [
                [
                  "count",
                  function (
                    this: unknown,
                    target: Record<PropertyKey, unknown>,
                  ) {
                    calls.push(["factory", this === null]);
                    if (raw) expect(target).toBe(raw);
                    raw = target;
                    target.label = "mutated";
                    return 3;
                  },
                  true,
                ],
                [
                  "other",
                  (target: Record<PropertyKey, unknown>) => {
                    calls.push(["other", target === raw]);
                    return 4;
                  },
                  true,
                ],
              ],
            ).props;
            watch(
              () => props.label,
              (value) => calls.push(["watch", value]),
              { flush: "sync" },
            );
            return "";
          }),
        {},
        "dom",
      );
    });
    set(undefined);
    flush();
    expect(props.count).toBe(3);
    expect(props.label).toBe("mutated");
    expect(calls).toEqual([
      ["factory", true],
      ["other", true],
    ]);
    set(5);
    flush();
    set(undefined);
    flush();
    expect(props.count).toBe(3);
    expect(
      calls.filter((row) => Array.isArray(row) && row[0] === "factory"),
    ).toHaveLength(1);
    stop();
  }));
test("failed defaults invalidate successful snapshot equality when parent restores original props", () =>
  withMicrotasks((flush) => {
    const initial = { count: 9, label: "plain", mode: "provided" };
    const [read, set] = createSignal<{
      count: number | undefined;
      label: string;
      mode: string;
    }>(initial);
    const failure = { factory: true };
    let props!: Readonly<{
        count: number | undefined;
        label: string;
        mode: string;
      }>,
      rendered = "",
      stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      createComponent(
        () =>
          sourceScheduler(() => {
            props = createDefaultProps(
              {
                get count() {
                  return read().count;
                },
                get label() {
                  return read().label;
                },
                get mode() {
                  return read().mode;
                },
              },
              ["count", "label", "mode"],
              [],
              [
                [
                  "count",
                  (raw: Record<PropertyKey, unknown>) => {
                    raw.label = "mutated";
                    throw failure;
                  },
                  true,
                ],
              ],
            ).props;
            createRenderEffect(() => {
              rendered = props.label + ":" + props.count + ":" + props.mode;
            });
            return "";
          }),
        {},
        "dom",
      );
    });
    set({ count: undefined, label: "plain", mode: "failure" });
    let caught: unknown;
    try {
      flush();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(props.label).toBe("mutated");
    expect(rendered).toBe("plain:9:provided");
    set(initial);
    flush();
    expect(props.label).toBe("plain");
    expect(props.mode).toBe("provided");
    expect(rendered).toBe("plain:9:provided");
    stop();
  }));
