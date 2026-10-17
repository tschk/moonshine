import "../../react/test/dom";
import { test, expect } from "bun:test";
import { mount, unmount } from "../src/mount";
import { h } from "../../dom/src/dom";
import {
  exposeComponent,
  componentRef,
} from "../../dom/src/component-instance";
import { getContext, createComponent } from "../../dom/src/component";
import { onCleanup } from "../../dom/src/reactive";
import { onMount, tick } from "../src/svelte";
test("synchronous capture retains descriptors and does not flush queued bind references", async () => {
  let published: object | null = null;
  const target = document.createElement("div");
  function App() {
    exposeComponent({
      get value() {
        return 7;
      },
      read() {
        return this.value;
      },
    });
    return h("b", null, "value");
  }
  const app = mount(App, {
    target,
    props: {
      [componentRef]: {
        get: () => published,
        set: (next: object | null) => (published = next),
      },
    },
  });
  expect(published).toBeNull();
  expect(Object.getOwnPropertyDescriptor(app, "value")?.get).toBeFunction();
  expect(Reflect.get(app, "read").call(app)).toBe(7);
  await tick();
  expect(published).toBe(app);
  await unmount(app);
});
test("distinct empty component identities and stop before post mount", async () => {
  let calls = 0;
  const target = document.createElement("div");
  const App = () => {
    onMount(() => {
      calls++;
    });
    return h("i", null, "x");
  };
  const a = mount(App, { target, props: {} }),
    b = mount(App, { target, props: {} });
  expect(a).not.toBe(b);
  const aStopped = unmount(a),
    bStopped = unmount(b);
  await Promise.all([aStopped, bStopped]);
  await tick();
  expect(calls).toBe(0);
  expect(target.textContent).toBe("");
});
test("invalid anchor fails before setup or mutation", () => {
  const target = document.createElement("div"),
    foreign = document.createElement("i");
  let calls = 0;
  expect(() =>
    mount(
      () => {
        calls++;
        return null;
      },
      { target, anchor: foreign, props: {} },
    ),
  ).toThrow("anchor");
  expect(calls).toBe(0);
  expect(target.childNodes).toHaveLength(0);
});
test("failure cleans owner and preserves primary setup error", () => {
  const target = document.createElement("div");
  const primary = Error("setup");
  let cleaned = 0;
  expect(() =>
    mount(
      () => {
        onCleanup(() => {
          cleaned++;
          throw Error("secondary");
        });
        throw primary;
      },
      { target, props: {} },
    ),
  ).toThrow(primary);
  expect(cleaned).toBe(1);
  expect(target.textContent).toBe("");
});
test("explicit contexts copy on first use and capture targets the actual frame", () => {
  const contexts = new Map<unknown, unknown>([["k", "first"]]);
  let captured: object | undefined;
  const value = createComponent(
    () => {
      contexts.set("k", "changed");
      expect(getContext("k")).toBe("changed");
      contexts.set("k", "later");
      expect(getContext("k")).toBe("changed");
      exposeComponent({ read: () => 1 });
      return 3;
    },
    {},
    "dom",
    { contexts, capture: (x) => (captured = x) },
  );
  expect(value).toBe(3);
  expect(Reflect.get(captured!, "read")()).toBe(1);
});
test("target and unsupported options fail before setup or mutation", async () => {
  let calls = 0;
  const App = () => {
    calls++;
    return h("b", null, "owned");
  };
  const target = document.createElement("div");
  target.textContent = "foreign";
  for (const invalid of [null, {}, document, document.createTextNode("x")])
    expect(() => mount(App, { target: invalid as Element, props: {} })).toThrow(
      "current-realm",
    );
  for (const key of ["events", "transformError", "transition", "unknown"])
    expect(() => mount(App, { target, props: {}, [key]: {} })).toThrow(
      "Unsupported native mount",
    );
  expect(calls).toBe(0);
  expect(target.textContent).toBe("foreign");
  for (const intro of [undefined, false, true]) {
    const instance = mount(App, { target, props: {}, intro });
    await unmount(instance, { outro: false });
  }
  expect(target.textContent).toBe("foreign");
  const instance = mount(App, { target, props: {} });
  await expect(unmount(instance, { outro: true } as never)).rejects.toThrow(
    "transitions",
  );
  expect(target.textContent).toBe("foreignowned");
  await unmount(instance);
});
test("nested child exposure cannot replace empty root or explicit root exports", async () => {
  const target = document.createElement("div");
  const child = { child: () => 1 };
  const Child = () => {
    exposeComponent(child);
    return h("b", null, "child");
  };
  const Empty = () => h(Child, {});
  const empty = mount(Empty, { target, props: {} }),
    other = mount(Empty, { target, props: {} });
  expect(empty).not.toBe(other);
  expect(Reflect.get(empty, "child")).toBeUndefined();
  const Root = () => {
    const view = h(Child, {});
    exposeComponent({ root: () => 2 });
    return view;
  };
  const root = mount(Root, { target, props: {} });
  expect(Reflect.get(root, "root")()).toBe(2);
  expect(Reflect.get(root, "child")).toBeUndefined();
  await Promise.all([unmount(empty), unmount(other), unmount(root)]);
});
test("anchor removed during setup fails movement and cleans only owned output", () => {
  const target = document.createElement("div"),
    before = document.createElement("i"),
    anchor = document.createElement("span"),
    after = document.createElement("i");
  before.textContent = "before";
  anchor.textContent = "anchor";
  after.textContent = "after";
  target.append(before, anchor, after);
  let stops = 0;
  expect(() =>
    mount(
      () => {
        onCleanup(() => {
          stops++;
        });
        anchor.remove();
        return h("b", null, "owned");
      },
      { target, anchor, props: {} },
    ),
  ).toThrow("target");
  expect(stops).toBe(1);
  expect(target.textContent).toBe("beforeafter");
  expect(target.firstChild).toBe(before);
  expect(target.lastChild).toBe(after);
});

test("server entries reject synchronously without setup", async () => {
  const server = await import("../src/server-mount");
  let calls = 0;
  expect(() =>
    server.mount(
      (() => {
        calls++;
        return null;
      }) as never,
      { target: document.createElement("div") } as never,
    ),
  ).toThrow("not available on the server");
  expect(() => server.unmount({})).toThrow("not available on the server");
  expect(calls).toBe(0);
});

test("anchor moved to another container during setup cannot redirect mounted output", () => {
  const target = document.createElement("div"),
    other = document.createElement("div"),
    anchor = document.createElement("span");
  target.append(anchor);
  let cleanups = 0;
  expect(() =>
    mount(
      () => {
        onCleanup(() => {
          cleanups++;
        });
        other.append(anchor);
        return h("b", null, "owned");
      },
      { target, anchor, props: {} },
    ),
  ).toThrow("target");
  expect(cleanups).toBe(1);
  expect(target.childNodes).toHaveLength(0);
  expect(other.childNodes).toHaveLength(1);
  expect(other.firstChild).toBe(anchor);
});
