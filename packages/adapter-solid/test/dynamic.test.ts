import { afterEach, expect, spyOn, test } from "bun:test";
import { createDynamic, Dynamic } from "../src/dynamic";
import { h, render } from "../src/dom";
import { createSignal, onCleanup, createRoot } from "../src/reactive";
import {
  createDynamic as serverDynamic,
  Dynamic as ServerDynamic,
  h as serverH,
  renderToString,
} from "../src/ssr";
import "../../react/test/dom";
let stop = () => {};
afterEach(() => {
  stop();
  stop = () => {};
});

test("component identity owns setup while forwarded getters preserve node and focus", () => {
  const container = document.createElement("main");
  document.body.append(container);
  const trace: string[] = [];
  const [value, setValue] = createSignal("one");
  const Component = (name: string) => (props: { value: string }) => {
    trace.push("setup " + name);
    onCleanup(() => trace.push("cleanup " + name));
    return h("input", {
      value: () => props.value,
      "data-kind": name,
    });
  };
  const A = Component("a"),
    B = Component("b");
  const [component, setComponent] = createSignal<typeof A | undefined>(A);
  stop = render(
    () =>
      createDynamic(component, {
        get value() {
          return value();
        },
      }),
    container,
  );
  const first = container.querySelector("input")!;
  first.focus();
  setValue("two");
  expect(first.value).toBe("two");
  expect(container.querySelector("input")).toBe(first);
  expect(document.activeElement).toBe(first);
  expect(trace).toEqual(["setup a"]);
  setComponent(() => B);
  expect(trace).toEqual(["setup a", "cleanup a", "setup b"]);
  expect(container.querySelector("input")!.value).toBe("two");
  expect(container.querySelector("input")).not.toBe(first);
  setComponent(undefined);
  expect(container.querySelector("input")).toBeNull();
  expect(trace.at(-1)).toBe("cleanup b");
  stop();
  container.remove();
});

test("Dynamic forwards live props and children without leaking component, and retains events", () => {
  const container = document.createElement("main");
  document.body.append(container);
  let clicks = 0;
  const [tag, setTag] = createSignal("button"),
    [label, setLabel] = createSignal("one");
  stop = render(
    () =>
      Dynamic({
        get component() {
          return tag();
        },
        get title() {
          return label();
        },
        get children() {
          return label();
        },
        onClick: () => clicks++,
      }),
    container,
  );
  const first = container.querySelector("button")!;
  expect(first.hasAttribute("component")).toBe(false);
  expect(first.title).toBe("one");
  first.click();
  expect(clicks).toBe(1);
  setLabel("two");
  expect(container.querySelector("button")).toBe(first);
  expect(first.textContent).toBe("two");
  expect(first.title).toBe("two");
  setTag("div");
  expect(container.querySelector("div")!.title).toBe("two");
  first.click();
  expect(clicks).toBe(1);
  stop();
  expect(container.textContent).toBe("");
  container.remove();
});

test("undefined selection stays empty without reading forwarded getters", () => {
  let reads = 0;
  const container = document.createElement("main");
  stop = render(
    () =>
      Dynamic({
        component: undefined,
        get title() {
          reads++;
          throw Error("unread");
        },
      }),
    container,
  );
  expect(reads).toBe(0);
  expect(container.textContent).toBe("");
});

test("browser factory rejects SSR before evaluating its selector", () => {
  let calls = 0;
  expect(() =>
    renderToString(() =>
      createDynamic(() => {
        calls++;
        return "p";
      }, {}),
    ),
  ).toThrow("explicit /ssr");
  expect(calls).toBe(0);
});

test("setup failure disposes component work and preserves the original error", () => {
  let cleaned = 0;
  const failure = Error("setup");
  const container = document.createElement("main");
  expect(() =>
    render(
      () =>
        createDynamic(
          () => () => {
            onCleanup(() => {
              cleaned++;
              throw Error("cleanup");
            });
            throw failure;
          },
          {},
        ),
      container,
    ),
  ).toThrow(failure);
  expect(cleaned).toBe(1);
  expect(container.textContent).toBe("");
});

test("SSR selects once per request with component ownership, escaping and no component attribute", () => {
  let selections = 0,
    setups = 0,
    cleanups = 0;
  for (let request = 0; request < 2; request++) {
    const Component = (props: { label: string }) => {
      setups++;
      onCleanup(() => cleanups++);
      return serverH("p", null, props.label);
    };
    expect(
      renderToString(() =>
        serverDynamic(
          () => {
            selections++;
            return Component;
          },
          { label: "<one>&" },
        ),
      ),
    ).toBe("<p>&lt;one&gt;&amp;</p>");
    expect(
      renderToString(() =>
        ServerDynamic({
          component: "button",
          title: "<two>",
          children: "text",
        }),
      ),
    ).toBe('<button title="&lt;two&gt;">text</button>');
  }
  expect(selections).toBe(2);
  expect(setups).toBe(2);
  expect(cleanups).toBe(2);
  expect(renderToString(() => ServerDynamic({ component: undefined }))).toBe(
    "",
  );
});

test("selected component context is restored after setup errors", () => {
  const original = Error("component failure");
  let disposed = false;
  createRoot((dispose) => {
    stop = dispose;
    try {
      createDynamic(
        () => () => {
          throw original;
        },
        {},
      );
    } catch (error) {
      expect(error).toBe(original);
    }
    onCleanup(() => {
      disposed = true;
    });
  });
  stop();
  expect(disposed).toBe(true);
});

test("intrinsic event getters update registration, read once per run, and drain old listeners", () => {
  const container = document.createElement("main");
  document.body.append(container);
  const trace: string[] = [];
  let reads = 0;
  const [label, setLabel] = createSignal("one");
  stop = render(
    () =>
      Dynamic({
        component: "button",
        get onClick() {
          reads++;
          const current = label();
          return () => trace.push(current);
        },
      }),
    container,
  );
  const button = container.querySelector("button")!;
  expect(reads).toBe(1);
  button.click();
  button.click();
  expect(reads).toBe(1);
  expect(trace).toEqual(["one", "one"]);
  setLabel("two");
  expect(reads).toBe(2);
  button.click();
  expect(trace).toEqual(["one", "one", "two"]);
  stop();
  container.append(button);
  button.click();
  expect(trace.length).toBe(3);
  container.remove();
});

test("direct event tuples, listener options, null and literal function props preserve their contracts", () => {
  const container = document.createElement("main");
  document.body.append(container);
  let calls = 0;
  const object = {
    capture: true,
    once: true,
    handleEvent() {
      expect(this).toBe(object);
      calls++;
    },
  };
  const [handler, setHandler] = createSignal<unknown>(object);
  let invoked = 0;
  const literal = () => {
    invoked++;
    return "must not invoke";
  };
  stop = render(
    () =>
      Dynamic({
        component: "button",
        get "on:click"() {
          return handler();
        },
        title: literal,
      }),
    container,
  );
  const button = container.querySelector("button")!;
  expect(invoked).toBe(0);
  expect(button.title).toContain("must not invoke");
  button.click();
  button.click();
  expect(calls).toBe(1);
  object.capture = false;
  setHandler(() => [
    (data: string) => {
      expect(data).toBe("payload");
      calls++;
    },
    "payload",
  ]);
  button.click();
  expect(calls).toBe(2);
  setHandler(null);
  button.click();
  expect(calls).toBe(2);
  stop();
  container.append(button);
  button.click();
  expect(calls).toBe(2);
  container.remove();
});

test("SSR intrinsic literal functions and event getters never execute", () => {
  let invoked = 0;
  function literal() {
    invoked++;
    return "unexpected";
  }
  const html = renderToString(() =>
    ServerDynamic({
      component: "button",
      title: literal,
      get onClick() {
        throw Error("server event getter read");
      },
    }),
  );
  expect(invoked).toBe(0);
  expect(html).toContain('title="function literal()');
});

test("equal reactive event values do not renew once listeners or duplicate cleanup", () => {
  const container = document.createElement("main");
  document.body.append(container);
  let calls = 0,
    reads = 0;
  const object = {
      once: true,
      handleEvent() {
        calls++;
      },
    },
    fn = () => calls++;
  const [revision, setRevision] = createSignal(0),
    [handler, setHandler] = createSignal<unknown>(object);
  let button!: HTMLButtonElement;
  let add!: ReturnType<typeof spyOn>;
  let remove!: ReturnType<typeof spyOn>;
  stop = render(
    () =>
      Dynamic({
        component: "button",
        ref: (node: HTMLButtonElement) => {
          button = node;
          add = spyOn(node, "addEventListener");
          remove = spyOn(node, "removeEventListener");
        },
        get "on:probe"() {
          revision();
          reads++;
          return handler();
        },
      }),
    container,
  );
  try {
    expect(reads).toBe(1);
    expect(add).toHaveBeenCalledTimes(1);
    button.dispatchEvent(new Event("probe"));
    // Happy DOM removes once listeners through its public method; count only later work.
    const onceRemoved = remove.mock.calls.length;
    setRevision(1);
    button.dispatchEvent(new Event("probe"));
    expect(calls).toBe(1);
    expect(reads).toBe(2);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(onceRemoved);
    setHandler(() => fn);
    setRevision(2);
    expect(reads).toBe(4);
    expect(add).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(onceRemoved + 1);
    button.dispatchEvent(new Event("probe"));
    expect(calls).toBe(2);
    setHandler(null);
    setRevision(3);
    expect(reads).toBe(6);
    expect(add).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(onceRemoved + 2);
    stop();
    expect(remove).toHaveBeenCalledTimes(onceRemoved + 2);
  } finally {
    stop();
    add.mockRestore();
    remove.mockRestore();
    container.remove();
  }
});

test("SVG dynamic tags retain namespaces, attributes, events and foreignObject child ownership", () => {
  const svg = "http://www.w3.org/2000/svg",
    html = "http://www.w3.org/1999/xhtml";
  const host = document.createElementNS(svg, "svg");
  document.body.append(host);
  const [tag, setTag] = createSignal("circle"),
    [value, setValue] = createSignal("1");
  let clicks = 0,
    cleanups = 0;
  stop = render(
    () =>
      createDynamic(tag, {
        get cx() {
          return value();
        },
        onClick: () => clicks++,
        get children() {
          if (tag() !== "foreignObject") return;
          onCleanup(() => cleanups++);
          return h("div", null, "child");
        },
      }),
    host,
  );
  for (const name of ["circle", "path", "foreignObject", "svg"]) {
    setTag(name);
    const node = host.firstElementChild!;
    expect(node.localName).toBe(name);
    expect(node.namespaceURI).toBe(svg);
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    if (name === "foreignObject")
      expect(node.firstElementChild!.namespaceURI).toBe(html);
  }
  expect(clicks).toBe(4);
  expect(cleanups).toBe(1);
  setTag("circle");
  const circle = host.firstElementChild!;
  setValue("2");
  expect(host.firstElementChild).toBe(circle);
  expect(circle.getAttribute("cx")).toBe("2");
  stop();
  host.append(circle);
  circle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(clicks).toBe(4);
  host.remove();
});

test("explicit xmlns keeps ambiguous SVG tags stable through dynamic replacements", () => {
  const svg = "http://www.w3.org/2000/svg";
  const host = document.createElementNS(svg, "svg");
  const [tag, setTag] = createSignal("a");
  stop = render(
    () =>
      Dynamic({
        get component() {
          return tag();
        },
        xmlns: svg,
        children: "label",
      }),
    host,
  );
  for (const name of ["a", "title", "a"]) {
    setTag(name);
    expect(host.firstElementChild!.localName).toBe(name);
    expect(host.firstElementChild!.namespaceURI).toBe(svg);
    expect(host.firstElementChild!.textContent).toBe("label");
  }
  stop();
  expect(host.firstElementChild).toBeNull();
});

test("Dynamic updates delegated handlers in place across mode transitions and releases on disposal", () => {
  const container = document.createElement("main");
  document.body.append(container);
  const trace: unknown[] = [];
  const first = function (this: Element, event: Event) {
    trace.push(["first", this === button, event.type]);
  };
  const final = function (this: Element, event: Event) {
    trace.push(["final", this === button, event.type]);
  };
  const object = {
    capture: true,
    once: true,
    handleEvent(event: Event) {
      trace.push(["object", this === object, event.type]);
    },
  };
  const [handler, setHandler] = createSignal<unknown>(first);
  const add = spyOn(document, "addEventListener"),
    remove = spyOn(document, "removeEventListener");
  let button!: HTMLButtonElement;
  stop = render(
    () =>
      Dynamic({
        component: "button",
        ref: (node: HTMLButtonElement) => {
          button = node;
        },
        get onClick() {
          return handler();
        },
      }),
    container,
  );
  const counts = () => [
    add.mock.calls.filter(([type]) => type === "click").length,
    remove.mock.calls.filter(([type]) => type === "click").length,
  ];
  try {
    button.click();
    setHandler(() => final);
    button.click();
    setHandler(() => [
      function (this: Element, data: unknown, event: Event) {
        trace.push([data, this === button, event.type]);
      },
      "tuple",
    ]);
    button.click();
    expect(counts()).toEqual([1, 0]);
    setHandler(null);
    button.click();
    expect(counts()).toEqual([1, 1]);
    setHandler(object);
    button.click();
    button.click();
    object.capture = false;
    setHandler(() => final);
    button.click();
    expect(counts()).toEqual([2, 1]);
    expect(trace).toEqual([
      ["first", true, "click"],
      ["final", true, "click"],
      ["tuple", true, "click"],
      ["object", true, "click"],
      ["final", true, "click"],
    ]);
    stop();
    expect(counts()).toEqual([2, 2]);
    container.append(button);
    button.click();
    expect(trace).toHaveLength(5);
  } finally {
    stop();
    add.mockRestore();
    remove.mockRestore();
    container.remove();
  }
});
