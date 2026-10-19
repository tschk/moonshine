import { afterEach, expect, test } from "bun:test";
import { h, render, type DOMChild } from "@tschk/moonshine-dom/dom";
import { h as serverH, renderToString } from "@tschk/moonshine-dom/ssr";
import {
  batch,
  createComputed,
  createRoot,
  createSignal,
} from "@tschk/moonshine-dom/reactive";
import {
  componentRef,
  exposeComponent,
} from "@tschk/moonshine-dom/component-instance";
import { Show } from "@tschk/moonshine-dom/control";
import { getComponentContext } from "@tschk/moonshine-dom/component";
import {
  onBeforeMount,
  onMounted,
  onBeforeUnmount,
  onUnmounted,
  onErrorCaptured,
} from "../src/lifecycle";
import { ref, watch, watchSyncEffect } from "../src/reactive";
import { inject, provide } from "../src/context";
import { withComponentErrorHandler } from "../src/errors";
import "../../react/test/dom";
const disposers: Array<() => void> = [];
afterEach(() => {
  for (const stop of disposers.splice(0)) stop();
  document.body.replaceChildren();
});
function container() {
  const node = document.createElement("main");
  document.body.append(node);
  return node;
}

test("mount is child-first with published references; before is parent-first and after is child-first after teardown", () => {
  const trace: string[] = [];
  const [state, setState] = createSignal(0);
  let watchRuns = 0,
    ignoredCleanup = 0;
  let reference: object | null = null;
  function Child(props: { name: string; children?: DOMChild }) {
    let element!: HTMLElement;
    createComputed(() => {
      state();
      watchRuns++;
    });
    onMounted(() => {
      expect(element.isConnected).toBe(true);
      trace.push("mount:" + props.name);
      return () => ignoredCleanup++;
    });
    onBeforeUnmount(() => {
      expect(element.isConnected).toBe(true);
      trace.push("before:" + props.name);
    });
    onUnmounted(() => {
      expect(element.isConnected).toBe(false);
      trace.push("after:" + props.name);
    });
    if (props.name === "a") exposeComponent({ name: "a" });
    element = h("div", null, props.children) as HTMLElement;
    return element;
  }
  const stop = render(
    () =>
      h(() => {
        let element!: HTMLElement;
        onMounted(() => {
          expect(reference).not.toBeNull();
          trace.push("mount:parent");
        });
        onBeforeUnmount(() => {
          expect(element.isConnected).toBe(true);
          trace.push("before:parent");
          setState(1);
          expect(watchRuns).toBe(6);
        });
        onUnmounted(() => {
          expect(element.isConnected).toBe(false);
          trace.push("after:parent");
          setState(2);
          expect(watchRuns).toBe(6);
        });
        element = h(
          "section",
          null,
          h(
            Child,
            {
              name: "a",
              [componentRef]: {
                get: () => reference,
                set: (next: object | null) => {
                  reference = next;
                },
              },
            },
            () => h(Child, { name: "grand" }),
          ),
          h(Child, { name: "b" }),
        ) as HTMLElement;
        return element;
      }, {}),
    container(),
  );
  disposers.push(stop);
  expect(trace).toEqual(["mount:grand", "mount:a", "mount:b", "mount:parent"]);
  stop();
  stop();
  expect(trace).toEqual([
    "mount:grand",
    "mount:a",
    "mount:b",
    "mount:parent",
    "before:parent",
    "before:a",
    "before:grand",
    "before:b",
    "after:grand",
    "after:a",
    "after:b",
    "after:parent",
  ]);
  expect(ignoredCleanup).toBe(0);
});

test("dynamic removal before commit cancels mounts and disposal during reference publication skips mounting", () => {
  const [visible, setVisible] = createSignal(false);
  let mounts = 0;
  const stop = render(
    () =>
      h(
        "div",
        null,
        Show({
          when: visible,
          children: () =>
            h(() => {
              onMounted(() => mounts++);
              return h("p", null, "child");
            }, {}),
        }),
      ),
    container(),
  );
  disposers.push(stop);
  batch(() => {
    setVisible(true);
    setVisible(false);
  });
  expect(mounts).toBe(0);
  const [show, setShow] = createSignal(true);
  let instance: object | null = null;
  disposers.push(
    render(
      () =>
        h(
          "div",
          null,
          Show({
            when: show,
            children: () =>
              h(
                () => {
                  onMounted(() => mounts++);
                  exposeComponent({ name: "child" });
                  return h("p", null, "reference child");
                },
                {
                  [componentRef]: {
                    get: () => instance,
                    set: (next: object | null) => {
                      instance = next;
                      if (next) setShow(false);
                    },
                  },
                },
              ),
          }),
        ),
      container(),
    ),
  );
  expect(mounts).toBe(0);
});

test("SSR skips every lifecycle even with browser globals and registration is strict", () => {
  const trace: string[] = [];
  expect(
    renderToString(() =>
      serverH(() => {
        onBeforeMount(() => trace.push("beforeMount"));
        onMounted(() => trace.push("mount"));
        onBeforeUnmount(() => trace.push("before"));
        onUnmounted(() => trace.push("after"));
        return serverH("p", null, "server");
      }, {}),
    ),
  ).toBe("<p>server</p>");
  expect(trace).toEqual([]);
  for (const hook of [
    onBeforeMount,
    onMounted,
    onBeforeUnmount,
    onUnmounted,
    onErrorCaptured,
  ])
    expect(() => hook(() => {})).toThrow("component initialization");
  createRoot((stop) => {
    expect(() => onMounted(() => {})).toThrow("component initialization");
    stop();
  });
});

test("lifecycle callbacks are untracked and returned functions do not register cleanup", () => {
  const [unrelated, setUnrelated] = createSignal(0);
  let setups = 0,
    ignored = 0;
  const stop = render(() => {
    createComputed(() => {
      setups++;
      h(() => {
        onBeforeMount(() => {
          unrelated();
          return () => ignored++;
        });
        onMounted(() => {
          unrelated();
          return () => ignored++;
        });
        onBeforeUnmount(() => {
          unrelated();
        });
        onUnmounted(() => {
          unrelated();
        });
        return null;
      }, {});
    });
    return null;
  }, container());
  disposers.push(stop);
  setUnrelated(1);
  expect(setups).toBe(1);
  stop();
  expect(ignored).toBe(0);
});

test("teardown errors and reentrant disposal preserve the first failure and finish peer hooks", () => {
  const trace: string[] = [];
  const failure = new Error("before failure");
  let stop = () => {};
  stop = render(
    () =>
      h(() => {
        onBeforeUnmount(() => {
          trace.push("before:a");
          stop();
          throw failure;
        });
        onBeforeUnmount(() => trace.push("before:b"));
        onUnmounted(() => {
          trace.push("after:a");
          throw new Error("after failure");
        });
        onUnmounted(() => trace.push("after:b"));
        return h("p", null, "owned");
      }, {}),
    container(),
  );
  disposers.push(stop);
  expect(() => stop()).toThrow(failure);
  expect(trace).toEqual(["before:a", "before:b", "after:a", "after:b"]);
  stop();
});

test("mounted errors drain peer callbacks before render cleanup", () => {
  const trace: string[] = [];
  const failure = new Error("mount failure");
  expect(() =>
    render(
      () =>
        h(() => {
          onMounted(() => {
            trace.push("first");
            throw failure;
          });
          onMounted(() => trace.push("second"));
          onUnmounted(() => trace.push("after"));
          return h("p", null, "owned");
        }, {}),
      container(),
    ),
  ).toThrow(failure);
  expect(trace).toEqual(["first", "second", "after"]);
});

test("mount nested hooks retain each frame and restore outside context including failures", () => {
  const seen: string[] = [];
  function Child(p: { id: string }) {
    const frame = getComponentContext();
    onMounted(() => {
      expect(getComponentContext()).toBe(frame);
      onUnmounted(() => seen.push(p.id));
    });
    return h("div", null, p.id);
  }
  const stop = render(
    () => h("main", null, h(Child, { id: "a" }), h(Child, { id: "b" })),
    container(),
  );
  expect(() => getComponentContext()).toThrow("initialization");
  stop();
  expect(seen).toEqual(["a", "b"]);
  expect(() => getComponentContext()).toThrow("initialization");
  expect(() =>
    render(
      () =>
        h(() => {
          onMounted(() => {
            onUnmounted(() => seen.push("failed"));
            throw Error("mount-failure");
          });
          return h("div");
        }, {}),
      container(),
    ),
  ).toThrow("mount-failure");
  expect(seen).toEqual(["a", "b", "failed"]);
  expect(() => getComponentContext()).toThrow("initialization");
});
test("mount disposing its branch cancels later mount and drains registered nested cleanup", () => {
  const [show, setShow] = createSignal(false);
  const seen: string[] = [];
  function Child() {
    onMounted(() => {
      onUnmounted(() => seen.push("nested"));
      setShow(false);
    });
    onMounted(() => seen.push("canceled"));
    return h("button");
  }
  const stop = render(
    () => Show({ when: show, children: () => h(Child, {}) }),
    container(),
  );
  setShow(true);
  expect(seen).toEqual(["nested"]);
  expect(document.querySelector("button")).toBeNull();
  stop();
  expect(seen).toEqual(["nested"]);
});

test("before-unmount hooks retain context and may register final unmount work", () => {
  const seen: string[] = [];
  function Child() {
    const frame = getComponentContext();
    onBeforeUnmount(() => {
      expect(getComponentContext()).toBe(frame);
      onUnmounted(() => seen.push("late-child"));
    });
    onUnmounted(() => seen.push("child"));
    return h("p", null, "child");
  }
  const stop = render(
    () =>
      h(() => {
        onBeforeUnmount(() => onUnmounted(() => seen.push("late-parent")));
        onUnmounted(() => seen.push("parent"));
        return h(Child, {});
      }, {}),
    container(),
  );
  disposers.push(stop);
  stop();
  expect(seen).toEqual(["child", "late-child", "parent", "late-parent"]);
  expect(() => getComponentContext()).toThrow("initialization");
});

test("onBeforeMount runs before DOM insertion and before onMounted, retains context, and supports dynamic onMounted registration", () => {
  const trace: string[] = [];
  const stop = render(
    () =>
      h(() => {
        let el!: HTMLElement;
        const frame = getComponentContext();
        provide("token", "ctx");
        onBeforeMount(() => {
          expect(getComponentContext()).toBe(frame);
          expect(el.isConnected).toBe(false);
          trace.push("beforeMount:1");
          onMounted(() => {
            expect(el.isConnected).toBe(true);
            trace.push("mounted:dynamic");
          });
        });
        onBeforeMount(() => {
          trace.push("beforeMount:2");
        });
        onMounted(() => {
          expect(el.isConnected).toBe(true);
          trace.push("mounted:static");
        });
        el = h("section", null, "ready") as HTMLElement;
        return el;
      }, {}),
    container(),
  );
  disposers.push(stop);
  expect(trace).toEqual([
    "beforeMount:1",
    "beforeMount:2",
    "mounted:static",
    "mounted:dynamic",
  ]);
});

test("onErrorCaptured intercepts descendant watcher errors bottom-up, stops propagation on false, and forwards unhandled or secondary errors", () => {
  const trigger = ref(0);
  const mode = ref<"stop-middle" | "propagate" | "secondary">("stop-middle");
  const trace: Array<[string, unknown, string, string | undefined]> = [];
  let leafFrame!: ReturnType<typeof getComponentContext>;

  function Leaf() {
    leafFrame = getComponentContext();
    // Self-registered onErrorCaptured must NOT intercept own watcher errors
    onErrorCaptured((err, _inst, info) => {
      trace.push(["self", err, info, undefined]);
      return false;
    });
    watch(
      trigger,
      (v) => {
        if (v > 0) throw `err:${v}`;
      },
      { flush: "sync" },
    );
    return h("span", null, "leaf");
  }

  function Middle() {
    provide("scope", "middle");
    onErrorCaptured((err, inst, info) => {
      expect(inst).toBe(leafFrame);
      trace.push(["middle:1", err, info, inject("scope")]);
      if (mode.value === "secondary") throw "secondary-from-middle";
      if (mode.value === "stop-middle") return false;
    });
    onErrorCaptured((err, _inst, info) => {
      trace.push(["middle:2", err, info, inject("scope")]);
    });
    return h(Leaf, {});
  }

  function Root() {
    provide("scope", "root");
    onErrorCaptured((err, inst, info) => {
      expect(inst).toBe(leafFrame);
      trace.push(["root", err, info, inject("scope", "top")]);
    });
    return h(Middle, {});
  }

  const topErrors: Array<[unknown, string]> = [];
  const stop = render(
    () =>
      withComponentErrorHandler(
        (err, info) => {
          topErrors.push([err, info.phase]);
        },
        () => h(Root, {}),
      ),
    container(),
  );
  disposers.push(stop);

  // 1. Returning false in middle:1 stops propagation before middle:2, root, and withComponentErrorHandler
  trigger.value = 1;
  expect(trace).toEqual([["middle:1", "err:1", "watch callback", "root"]]);
  expect(topErrors).toEqual([]);

  // 2. Returning void in all hooks propagates through middle:1 -> middle:2 -> root -> withComponentErrorHandler
  trace.length = 0;
  mode.value = "propagate";
  trigger.value = 2;
  expect(trace).toEqual([
    ["middle:1", "err:2", "watch callback", "root"],
    ["middle:2", "err:2", "watch callback", "root"],
    ["root", "err:2", "watch callback", "top"],
  ]);
  expect(topErrors).toEqual([["err:2", "watch callback"]]);

  // 3. Throwing a secondary error in middle:1 replaces the error for middle:2, root, and withComponentErrorHandler
  trace.length = 0;
  topErrors.length = 0;
  mode.value = "secondary";
  trigger.value = 3;
  expect(trace).toEqual([
    ["middle:1", "err:3", "watch callback", "root"],
    ["middle:2", "secondary-from-middle", "watch callback", "root"],
    ["root", "secondary-from-middle", "watch callback", "top"],
  ]);
  expect(topErrors).toEqual([["secondary-from-middle", "watch callback"]]);

  // 4. Without withComponentErrorHandler, non-false onErrorCaptured rethrows the error after running hooks, and drains watchSyncEffect cleanups
  const effectTrigger = ref(0);
  const cleaned: number[] = [];
  const unguardedTrace: string[] = [];
  const stopUnguarded = render(
    () =>
      h(() => {
        onErrorCaptured((err, _inst, info) => {
          unguardedTrace.push(`${String(err)}:${info}`);
        });
        return h(() => {
          watchSyncEffect((clean) => {
            const v = effectTrigger.value;
            clean(() => cleaned.push(v));
            if (v > 0) throw new Error("unhandled-effect");
          });
          return h("p", null, "ok");
        }, {});
      }, {}),
    container(),
  );
  disposers.push(stopUnguarded);
  expect(() => {
    effectTrigger.value = 1;
  }).toThrow("unhandled-effect");
  expect(unguardedTrace).toEqual(["Error: unhandled-effect:watch effect"]);
  expect(cleaned).toEqual([0, 1]);
});
