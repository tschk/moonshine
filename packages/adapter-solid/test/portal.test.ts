import { afterEach, expect, test } from "bun:test";
import { h, Portal } from "../src/portal";
import { render } from "@tschk/moonshine-dom/dom";
import { getContext, setContext } from "@tschk/moonshine-dom/component";
import {
  createComputed,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import {
  h as serverH,
  renderToString,
  Portal as ServerPortal,
} from "../src/ssr";
import "../../react/test/dom";
let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});
test("parent disposal during child setup cancels the pending portal mount", () => {
  const target = document.createElement("div"),
    origin = document.createElement("div");
  document.body.append(origin, target);
  let owner: ReturnType<typeof getOwner> = null;
  let cleaned = 0,
    runs = 0;
  const [value, write] = createSignal(0);
  stop = render(() => {
    owner = getOwner();
    return h("button", {}, "origin");
  }, origin);
  function Child() {
    onCleanup(() => cleaned++);
    createComputed(() => {
      value();
      runs++;
    });
    stop();
    return h("button", {}, "remote");
  }
  runWithOwner(owner, () =>
    h(Portal, {
      mount: target,
      get children() {
        return h(Child, {});
      },
    }),
  );
  expect(cleaned).toBe(1);
  expect(target.childNodes.length).toBe(0);
  expect(runs).toBe(1);
  write(1);
  expect(runs).toBe(1);
});
test("nested portals follow logical delegated ancestry but physical direct listeners", () => {
  const target = document.createElement("div"),
    second = document.createElement("div"),
    origin = document.createElement("div");
  document.body.append(origin, target, second);
  const trace: string[] = [];
  let cleaned = 0;
  function Leaf() {
    expect(getContext("portal")).toBe("context");
    onCleanup(() => cleaned++);
    return h(
      "button",
      {
        onClick: () => trace.push("leaf"),
        "on:click": () => trace.push("direct"),
      },
      "leaf",
    );
  }
  function App() {
    setContext("portal", "context");
    return h(
      "section",
      { onClick: () => trace.push("parent") },
      h(Portal, {
        mount: target,
        get children() {
          return h(
            "div",
            { onClick: () => trace.push("middle") },
            h(Portal, {
              mount: second,
              get children() {
                return h(Leaf, {});
              },
            }),
          );
        },
      }),
    );
  }
  second.addEventListener("click", () => trace.push("physical"));
  stop = render(() => h(App, {}), origin);
  second.querySelector("button")!.click();
  expect(trace).toEqual(["direct", "physical", "leaf", "middle", "parent"]);
  stop();
  expect(cleaned).toBe(1);
  expect(target.childNodes.length + second.childNodes.length).toBe(0);
});
test("physical object options snapshot capture and preserve getters' receiver/order", () => {
  const origin = document.createElement("div");
  document.body.append(origin);
  let calls = 0;
  const reads: string[] = [];
  const handler = {
    capture: true,
    handleEvent() {
      calls++;
    },
  };
  const props = {
    get onClick() {
      expect(this).toBe(props);
      reads.push("event");
      return handler;
    },
    get ref() {
      expect(this).toBe(props);
      reads.push("ref");
      return () => reads.push("attached");
    },
    get title() {
      expect(this).toBe(props);
      reads.push("title");
      return "title";
    },
  };
  stop = render(() => h("button", props), origin);
  const button = origin.firstChild as HTMLButtonElement;
  expect(reads).toEqual(["event", "ref", "attached", "title"]);
  button.click();
  expect(calls).toBe(1);
  handler.capture = false;
  stop();
  button.click();
  expect(calls).toBe(1);
});
test("SSR does not evaluate portal mount or children; ownerless browser use rejects", () => {
  const props = {
    get mount(): Element {
      throw Error("mount read");
    },
    get children(): never {
      throw Error("children read");
    },
  };
  expect(renderToString(() => serverH(ServerPortal, props))).toBe("");
  expect(renderToString(() => Portal(props))).toBe("");
  const origin = document.createElement("div");
  document.body.append(origin);

  expect(() => Portal({})).toThrow("live native owner");
});
test("failed mounting disposes owned children and SVG containers preserve namespace", () => {
  const origin = document.createElement("div"),
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(origin, svg);
  let cleaned = 0;
  stop = render(
    () =>
      h(Portal, {
        mount: svg,
        isSVG: true,
        get children() {
          onCleanup(() => cleaned++);
          return h("a", {}, "svg");
        },
      }),
    origin,
  );
  expect(svg.firstElementChild?.namespaceURI).toBe(svg.namespaceURI);
  expect(svg.querySelector("a")?.namespaceURI).toBe(svg.namespaceURI);
  stop();
  expect(cleaned).toBe(1);
  const bad = document.createElement("div");
  bad.appendChild = () => {
    throw Error("append failed");
  };
  expect(() =>
    render(
      () =>
        h(Portal, {
          mount: bad,
          get children() {
            onCleanup(() => cleaned++);
            return h("span", {}, "fail");
          },
        }),
      origin,
    ),
  ).toThrow("append failed");
  expect(cleaned).toBe(2);
});

test("delegated cancellation and tuple calling conventions", () => {
  const target = document.createElement("div");
  document.body.append(target);
  const trace: unknown[] = [];
  let retained: HTMLButtonElement;
  stop = render(
    () =>
      h(
        "section",
        { onClick: () => trace.push("parent") },
        h(
          "button",
          {
            onClick: [
              function (this: Element, event: Event) {
                expect(this).toBe(event.currentTarget);
                trace.push("leaf");
                event.stopPropagation();
              },
              undefined,
            ],
            onScroll: [
              function (data: unknown, event: Event) {
                trace.push([data, event.type]);
              },
              undefined,
            ],
          },
          "button",
        ),
      ),
    target,
  );
  retained = target.querySelector("button")!;
  retained.click();
  expect(trace).toEqual(["leaf"]);
  trace.length = 0;

  retained.dispatchEvent(new Event("scroll"));
  expect(trace).toEqual([[undefined, "scroll"]]);
  stop();
  trace.length = 0;
  retained.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(trace).toEqual([]);
});

test("head portals own independent ranges and reactive styles", () => {
  const origin = document.createElement("div");
  document.body.append(origin);
  const existing = document.createElement("style");
  existing.textContent = "/* existing */";
  document.head.append(existing);
  const [color, setColor] = createSignal("red");
  stop = render(
    () =>
      h(
        "section",
        {},
        h(Portal, {
          mount: document.head,
          get children() {
            return h(
              "style",
              { "data-head-one": "" },
              () => ".one{color:" + color() + "}",
            );
          },
        }),
        h(Portal, {
          mount: document.head,
          get children() {
            return h("style", { "data-head-two": "" }, ".two{color:blue}");
          },
        }),
      ),
    origin,
  );
  expect(document.head.querySelector("[data-head-one]")?.textContent).toBe(
    ".one{color:red}",
  );
  setColor("green");
  expect(document.head.querySelector("[data-head-one]")?.textContent).toBe(
    ".one{color:green}",
  );
  stop();
  expect(
    document.head.querySelector("[data-head-one],[data-head-two]"),
  ).toBeNull();
  expect(existing.parentNode).toBe(document.head);
  existing.remove();
});
test("head child setup disposing its parent releases the newly created root", () => {
  const origin = document.createElement("div");
  document.body.append(origin);
  let owner: ReturnType<typeof getOwner> = null;
  let cleaned = 0;
  stop = render(() => {
    owner = getOwner();
    return h("span", {}, "origin");
  }, origin);
  runWithOwner(owner, () =>
    h(Portal, {
      mount: document.head,
      get children() {
        onCleanup(() => cleaned++);
        stop();
        return h("style", { "data-disposed-head": "" }, "/* canceled */");
      },
    }),
  );
  expect(cleaned).toBe(1);
  expect(document.head.querySelector("[data-disposed-head]")).toBeNull();
});
test("shadow portals retain context and release their owned content", () => {
  const origin = document.createElement("div"),
    mount = document.createElement("div");
  document.body.append(origin, mount);
  let cleaned = 0;
  function Child() {
    expect(getContext("shadow")).toBe("provided");
    onCleanup(() => cleaned++);
    return h("button", {}, "shadow");
  }
  function App() {
    setContext("shadow", "provided");
    return h(Portal, {
      mount,
      useShadow: true,
      get children() {
        return h(Child, {});
      },
    });
  }
  stop = render(() => h(App, {}), origin);
  const container = mount.firstElementChild!;
  expect(container.shadowRoot?.querySelector("button")?.textContent).toBe(
    "shadow",
  );
  stop();
  expect(cleaned).toBe(1);
  expect(mount.childNodes.length).toBe(0);
  expect(container.shadowRoot?.querySelector("button")).toBeNull();
});

test("ordinary shadows nested in a portal retarget to their host", () => {
  const origin = document.createElement("div"),
    target = document.createElement("div");
  document.body.append(origin, target);
  const trace: unknown[] = [];
  const log = (name: string) =>
    function (this: Element, event: Event) {
      expect(this).toBe(event.currentTarget);
      trace.push([name, (event.target as Element).localName]);
    };
  function Child() {
    const host = h("article", { onClick: log("host") });
    const shadow = host.attachShadow({ mode: "open" });
    onCleanup(
      render(() => h("button", { onClick: log("leaf") }, "leaf"), shadow),
    );
    return host;
  }
  stop = render(
    () =>
      h(
        "section",
        { onClick: log("parent") },
        h(Portal, {
          mount: target,
          get children() {
            return h(Child, {});
          },
        }),
      ),
    origin,
  );
  target
    .querySelector("article")!
    .shadowRoot!.querySelector("button")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  expect(trace).toEqual([
    ["leaf", "button"],
    ["host", "article"],
    ["parent", "article"],
  ]);
  stop();
  expect(target.childNodes.length).toBe(0);
});

test("foreign document portals share delegated listeners and release them after the last owner", () => {
  const foreign = document.implementation.createHTMLDocument("foreign");
  const origins = [
    document.createElement("div"),
    document.createElement("div"),
  ];
  document.body.append(...origins);
  let adds = 0,
    removes = 0;
  const add = foreign.addEventListener,
    remove = foreign.removeEventListener;
  foreign.addEventListener = ((...args: unknown[]) => {
    adds++;
    Reflect.apply(add, foreign, args);
  }) as typeof add;
  foreign.removeEventListener = ((...args: unknown[]) => {
    removes++;
    Reflect.apply(remove, foreign, args);
  }) as typeof remove;
  const trace: string[] = [];
  let cleaned = 0;
  const mount = (index: number) =>
    render(
      () =>
        h(
          "section",
          { onClick: () => trace.push("parent" + index) },
          h(Portal, {
            mount: foreign.body,
            get children() {
              onCleanup(() => cleaned++);
              return h(
                "button",
                {
                  "data-index": index,
                  onClick: () => trace.push("leaf" + index),
                  "on:click": () => trace.push("direct" + index),
                },
                "foreign",
              );
            },
          }),
        ),
      origins[index]!,
    );
  const first = mount(0),
    second = mount(1);
  expect(adds).toBe(22);
  expect(removes).toBe(0);
  foreign.querySelector<HTMLButtonElement>('[data-index="0"]')!.click();
  expect(trace).toEqual(["direct0", "leaf0", "parent0"]);
  first();
  expect(removes).toBe(0);
  trace.length = 0;
  foreign.querySelector<HTMLButtonElement>('[data-index="1"]')!.click();
  expect(trace).toEqual(["direct1", "leaf1", "parent1"]);
  second();
  expect(removes).toBe(22);
  expect(cleaned).toBe(2);
  expect(foreign.querySelector("button")).toBeNull();
  const again = mount(0);
  again();
  expect(adds).toBe(44);
  expect(removes).toBe(44);
});
test("foreign construction cancellation releases document listeners and children", () => {
  const foreign = document.implementation.createHTMLDocument("foreign"),
    origin = document.createElement("div");
  document.body.append(origin);
  let adds = 0,
    removes = 0,
    cleaned = 0;
  const add = foreign.addEventListener,
    remove = foreign.removeEventListener;
  foreign.addEventListener = ((...args: unknown[]) => {
    adds++;
    Reflect.apply(add, foreign, args);
  }) as typeof add;
  foreign.removeEventListener = ((...args: unknown[]) => {
    removes++;
    Reflect.apply(remove, foreign, args);
  }) as typeof remove;
  let owner: ReturnType<typeof getOwner> = null;
  stop = render(() => {
    owner = getOwner();
    return h("span", {}, "origin");
  }, origin);
  runWithOwner(owner, () =>
    h(Portal, {
      mount: foreign.body,
      get children() {
        onCleanup(() => cleaned++);
        stop();
        return h("button", {}, "canceled");
      },
    }),
  );
  expect(adds).toBe(22);
  expect(removes).toBe(22);
  expect(cleaned).toBe(1);
  expect(foreign.querySelector("button")).toBeNull();
});
