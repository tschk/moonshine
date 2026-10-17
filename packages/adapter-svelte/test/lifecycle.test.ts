import { afterEach, expect, spyOn, test } from "bun:test";
import { h, render } from "@tschk/moonshine-dom/dom";
import { createRoot, createSignal } from "@tschk/moonshine-dom/reactive";
import { Show } from "@tschk/moonshine-dom/control";
import { h as serverH, renderToString } from "@tschk/moonshine-dom/ssr";
import {
  createContext,
  getContext,
  setContext,
  hasContext,
  getAllContexts,
  createEventDispatcher,
  onDestroy,
  onMount,
  tick,
} from "../src/svelte";
import {
  componentEvents,
  createComponent,
} from "@tschk/moonshine-dom/component";
import {
  componentRef,
  exposeComponent,
} from "@tschk/moonshine-dom/component-instance";
import { createState, createRuneEffect } from "../src/runes";
import "../../react/test/dom";

let dispose = () => {};

test("an earlier sibling effect preserves component mount/effect registration order", async () => {
  const trace: string[] = [];
  const container = document.createElement("main");
  document.body.append(container);
  dispose = render(() => {
    createRuneEffect(() => {
      trace.push("sibling");
    });
    return h(() => {
      onMount(() => {
        trace.push("mount");
      });
      createRuneEffect(() => {
        trace.push("effect");
      });
      return h("p", null, "ready");
    }, {});
  }, container);
  await tick();
  expect(trace).toEqual(["sibling", "mount", "effect"]);
});

test("component references publish before earlier mount/effect callbacks and clear after disposal", async () => {
  type Instance = { readonly value: number; increment(): void };
  const reference = createState<Instance | null | undefined>(undefined);
  const trace: string[] = [];
  const container = document.createElement("main");
  document.body.append(container);
  function Child() {
    const [value, setValue] = createSignal(0);
    exposeComponent({
      get value() {
        return value();
      },
      increment() {
        setValue((count) => count + 1);
      },
    });
    return h("output", null, value);
  }
  function Parent() {
    onMount(() => {
      trace.push("mount:" + reference.value?.value);
    });
    createRuneEffect(() => {
      trace.push("effect:" + reference.value?.value);
    });
    return h(Child, {
      [componentRef]: {
        get: () => reference.value,
        set: (value: Instance | null) => {
          reference.value = value;
        },
      },
    });
  }
  dispose = render(() => h(Parent, {}), container);
  expect(reference.value).toBeUndefined();
  expect(trace).toEqual([]);
  await tick();
  expect(trace).toEqual(["mount:0", "effect:0"]);
  reference.value!.increment();
  expect(container.textContent).toBe("1");
  await tick();
  expect(trace).toEqual(["mount:0", "effect:0", "effect:1"]);
  const previous = reference.value;
  dispose();
  expect(reference.value).toBe(previous);
  await tick();
  expect(reference.value).toBeNull();
  expect(trace).toHaveLength(3);
});

test("reference publication can dispose an owner before its first rune effect", async () => {
  const container = document.createElement("main");
  document.body.append(container);
  let runs = 0;
  function Child() {
    exposeComponent({ ready: true });
    return h("p", null, "child");
  }
  dispose = render(() => {
    createRuneEffect(() => {
      runs++;
    });
    return h(Child, {
      [componentRef]: {
        get: () => undefined,
        set: () => {
          dispose();
        },
      },
    });
  }, container);
  await tick();
  expect(runs).toBe(0);
  expect(container.childNodes).toHaveLength(0);
});
afterEach(() => {
  dispose();
  dispose = () => {};
  document.body.replaceChildren();
});

test("onMount observes attached DOM untracked and owns its returned cleanup", async () => {
  const container = document.createElement("main");
  document.body.append(container);
  const [value, setValue] = createSignal(1);
  let mounts = 0,
    cleanups = 0,
    destroys = 0;
  dispose = render(() => {
    let element!: HTMLElement;
    onMount(() => {
      expect(element.isConnected).toBe(true);
      value();
      mounts++;
      return () => cleanups++;
    });
    onDestroy(() => destroys++);
    return (element = h("p", null, "mounted"));
  }, container);
  expect(mounts).toBe(0);
  await tick();
  expect(mounts).toBe(1);
  setValue(2);
  await tick();
  expect(mounts).toBe(1);
  dispose();
  dispose();
  expect(cleanups).toBe(1);
  expect(destroys).toBe(1);
});

test("dynamically inserted branches mount after insertion and dispose once", async () => {
  const container = document.createElement("main");
  document.body.append(container);
  const [visible, setVisible] = createSignal(false);
  const attached: boolean[] = [];
  let cleanups = 0,
    destroys = 0;
  dispose = render(
    () =>
      Show({
        when: visible,
        children: () => {
          let element!: HTMLElement;
          onMount(() => {
            attached.push(element.isConnected);
            return () => cleanups++;
          });
          onDestroy(() => destroys++);
          return (element = h("p", null, "branch"));
        },
      }),
    container,
  );
  setVisible(true);
  await tick();
  expect(attached).toEqual([true]);
  setVisible(false);
  expect(cleanups).toBe(1);
  expect(destroys).toBe(1);
  setVisible(true);
  setVisible(false);
  await tick();
  expect(attached).toEqual([true]);
  expect(destroys).toBe(2);
  expect(cleanups).toBe(1);
  dispose();
  expect(destroys).toBe(2);
});

test("SSR skips mounting even with DOM globals and runs destroy once", async () => {
  let mounts = 0,
    destroys = 0,
    cleanups = 0;
  const html = renderToString(() => {
    onMount(() => {
      mounts++;
      return () => cleanups++;
    });
    onDestroy(() => destroys++);
    return serverH("p", null, "server");
  });
  expect(html).toBe("<p>server</p>");
  expect(destroys).toBe(1);
  await tick();
  expect(mounts).toBe(0);
  expect(cleanups).toBe(0);
  expect(destroys).toBe(1);
});

test("lifecycle registration outside a live owner fails explicitly", () => {
  expect(() => onMount(() => {})).toThrow("component initialization");
  expect(() => onDestroy(() => {})).toThrow("component initialization");
  createRoot((stop) => {
    stop();
    expect(() => onMount(() => {})).toThrow("component initialization");
  });
});

test("tick resolves after native updates and never synchronously", async () => {
  const container = document.createElement("main");
  document.body.append(container);
  const [value, setValue] = createSignal(0);
  dispose = render(() => h("output", null, value), container);
  setValue(2);
  let finished = false;
  const pending = tick().then(() => {
    finished = true;
    expect(container.textContent).toBe("2");
  });
  expect(finished).toBe(false);
  await pending;
  expect(finished).toBe(true);
});

test("async mounts do not turn promise values into cleanup callbacks", async () => {
  let cleanup = 0;
  createRoot((stop) => {
    dispose = stop;
    onMount(async () => () => cleanup++);
  });
  await tick();
  await tick();
  dispose();
  expect(cleanup).toBe(0);
});

test("mount cleanup runs once when mounting disposes its own owner", async () => {
  let cleanups = 0;
  createRoot((stop) => {
    dispose = stop;
    onMount(() => {
      stop();
      return () => cleanups++;
    });
  });
  await tick();
  expect(cleanups).toBe(1);
  dispose();
  expect(cleanups).toBe(1);
});

test("dispatcher registration outside setup rejects without global DOM events", () => {
  const global = spyOn(window, "dispatchEvent");
  const documentDispatch = spyOn(document, "dispatchEvent");
  try {
    expect(() => createEventDispatcher<{ change: number }>()).toThrow(
      "component initialization",
    );
    expect(global).not.toHaveBeenCalled();
    expect(documentDispatch).not.toHaveBeenCalled();
  } finally {
    global.mockRestore();
    documentDispatch.mockRestore();
  }
});

test("DOM components inherit context through lazy branches and isolate sibling overrides", async () => {
  const key = Symbol("theme");
  const [visible, setVisible] = createSignal(false);
  const seen: unknown[] = [];
  const [readTyped, setTyped, hasTyped] = createContext<string>();
  function Leaf() {
    seen.push([getContext(key), readTyped(), hasContext(key), hasTyped()]);
    return h("span", null, String(getContext(key)));
  }
  function Override() {
    setContext(key, "override");
    return h(Leaf, null);
  }
  function Parent() {
    setContext(key, "parent");
    setTyped("typed");
    const contexts = getAllContexts();
    expect(contexts).toBe(getAllContexts());
    contexts.set(key, "live-parent");
    expect(getContext(key)).toBe("live-parent");
    return h(
      "div",
      null,
      () => h(Override, null),
      () => h(Leaf, null),
      Show({ when: visible, children: () => h(Leaf, null) }),
    );
  }
  const container = document.createElement("main");
  document.body.append(container);
  dispose = render(() => h(Parent, null), container);
  expect(seen).toEqual([
    ["override", "typed", true, true],
    ["live-parent", "typed", true, true],
  ]);
  setVisible(true);
  expect(seen.at(-1)).toEqual(["live-parent", "typed", true, true]);
  expect(container.textContent).toBe("overridelive-parentlive-parent");
  expect(() => getContext(key)).toThrow("component initialization");
  expect(() => setContext(key, 1)).toThrow("component initialization");
  expect(() => hasContext(key)).toThrow("component initialization");
  expect(() => getAllContexts()).toThrow("component initialization");
  const [missing] = createContext<number>();
  expect(() =>
    render(
      () =>
        h(() => {
          missing();
          return null;
        }, null),
      container,
    ),
  ).toThrow("Context has not been set");
  await tick();
});

test("component dispatch snapshots listeners, cancellation and receiver without callback-prop/global dispatch", () => {
  let dispatch!: ReturnType<typeof createEventDispatcher<{ change: number }>>;
  const calls: unknown[] = [];
  const callbacks: Array<(event: CustomEvent<number>) => void> = [];
  callbacks.push(function (this: unknown, event) {
    calls.push(["first", event.detail, event.bubbles, event.cancelable, this]);
    callbacks.pop();
    event.preventDefault();
  });
  callbacks.push((event) => calls.push(["second", event.detail]));
  const map = { change: callbacks };
  let callbackProps = 0;
  const container = document.createElement("main");
  document.body.append(container);
  const global = spyOn(window, "dispatchEvent"),
    documentDispatch = spyOn(document, "dispatchEvent");
  try {
    dispose = render(
      () =>
        h(
          () => {
            dispatch = createEventDispatcher();
            return h("p", null, "events");
          },
          { [componentEvents]: map, onchange: () => callbackProps++ },
        ),
      container,
    );
    expect(dispatch("change", 4, { cancelable: true })).toBe(false);
    expect(calls).toEqual([
      ["first", 4, false, true, undefined],
      ["second", 4],
    ]);
    expect(callbackProps).toBe(0);
    expect(global).not.toHaveBeenCalled();
    expect(documentDispatch).not.toHaveBeenCalled();
    calls.length = 0;
    expect(dispatch("change", 5)).toBe(true);
    expect(calls).toEqual([["first", 5, false, false, undefined]]);
    dispose();
    expect(dispatch("change", 6, { cancelable: true })).toBe(true);
    expect(calls).toHaveLength(1);
  } finally {
    global.mockRestore();
    documentDispatch.mockRestore();
  }
});

test("SSR components inherit contexts, suppress mount and dispose events while DOM globals exist", async () => {
  let mounts = 0,
    destroys = 0,
    listeners = 0;
  let dispatch!: ReturnType<typeof createEventDispatcher<{ ready: string }>>;
  const html = renderToString(() =>
    serverH(() => {
      setContext("server", "value");
      return serverH(
        () => {
          expect(getContext("server")).toBe("value");
          onMount(() => {
            mounts++;
          });
          onDestroy(() => destroys++);
          dispatch = createEventDispatcher();
          expect(dispatch("ready", "setup")).toBe(true);
          return serverH("p", null, "server");
        },
        { [componentEvents]: { ready: () => listeners++ } },
      );
    }, null),
  );
  expect(html).toBe("<p>server</p>");
  expect([mounts, destroys, listeners]).toEqual([0, 1, 1]);
  await tick();
  expect(mounts).toBe(0);
  expect(dispatch("ready", "disposed")).toBe(true);
  expect(listeners).toBe(1);
});

test("component frame lifecycle/context APIs reject registration after initialization", async () => {
  const container = document.createElement("main");
  document.body.append(container);
  let checked = false;
  dispose = render(
    () =>
      h(() => {
        onMount(() => {
          expect(() => getContext("key")).toThrow("component initialization");
          expect(() => onDestroy(() => {})).toThrow("component initialization");
          expect(() => createEventDispatcher()).toThrow(
            "component initialization",
          );
          checked = true;
        });
        return h("p", null, "mounted");
      }, null),
    container,
  );
  await tick();
  expect(checked).toBe(true);
});

test("live context maps match installed Svelte client and server ownership", async () => {
  const expected = [true, "live", 1, "child", "live", false];
  for (const mode of ["dom", "ssr"] as const) {
    const trace: unknown[] = [];
    createRoot((stop) => {
      createComponent(
        () => {
          setContext("theme", "parent");
          const contexts = getAllContexts();
          trace.push(contexts === getAllContexts());
          contexts.set("theme", "live");
          trace.push(getContext("theme"));
          setContext("later", 1);
          trace.push(contexts.get("later"));
          createComponent(
            () => {
              getAllContexts().set("theme", "child");
              trace.push(getContext("theme"));
            },
            {},
            mode,
          );
          trace.push(getContext("theme"));
        },
        {},
        mode,
      );
      createComponent(() => trace.push(hasContext("theme")), {}, mode);
      stop();
    });
    expect(trace).toEqual(expected);
    const pkg = Bun.resolveSync(
      "svelte/package.json",
      `${import.meta.dir}/../../../examples/svelte-adopt`,
    );
    const target = mode === "dom" ? "client" : "server";
    const context = new URL(
      `./src/internal/${target}/context.js`,
      `file://${pkg}`,
    ).pathname;
    const child = Bun.spawn(
      [
        process.execPath,
        "--conditions=browser",
        "-e",
        `
import {push,pop,getAllContexts,getContext,setContext,hasContext} from ${JSON.stringify(context)};
const trace=[];
push({},true);setContext('theme','parent');const contexts=getAllContexts();
trace.push(contexts===getAllContexts());contexts.set('theme','live');trace.push(getContext('theme'));
setContext('later',1);trace.push(contexts.get('later'));
push({},true);getAllContexts().set('theme','child');trace.push(getContext('theme'));pop();
trace.push(getContext('theme'));pop();push({},true);trace.push(hasContext('theme'));pop();
console.log(JSON.stringify(trace));
`,
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
    expect(JSON.parse(output)).toEqual(expected);
  }
});

test("DOM destroy uses pending state history while SSR destroy reads live state", async () => {
  const domState = createState(0);
  const seen: number[] = [];
  const container = document.createElement("main");
  dispose = render(
    () =>
      h(() => {
        onDestroy(() => seen.push(domState.value));
        return h("p", null, () => domState.value);
      }, {}),
    container,
  );
  domState.value = 1;
  dispose();
  expect(seen).toEqual([0]);
  await tick();
  expect(domState.value).toBe(1);
  const serverState = createState(0);
  expect(
    renderToString(() =>
      serverH(() => {
        onDestroy(() => seen.push(serverState.value));
        serverState.value = 2;
        return serverH("p", null, "server");
      }, {}),
    ),
  ).toBe("<p>server</p>");
  expect(seen).toEqual([0, 2]);
});
