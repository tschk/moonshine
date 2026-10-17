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
import { onMounted, onBeforeUnmount, onUnmounted } from "../src/lifecycle";
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
        onMounted(() => trace.push("mount"));
        onBeforeUnmount(() => trace.push("before"));
        onUnmounted(() => trace.push("after"));
        return serverH("p", null, "server");
      }, {}),
    ),
  ).toBe("<p>server</p>");
  expect(trace).toEqual([]);
  for (const hook of [onMounted, onBeforeUnmount, onUnmounted])
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
