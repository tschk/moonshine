import { afterEach, expect, test } from "bun:test";
import { h, render, type DOMChild } from "../src/dom";
import { h as serverH, defer, renderToString, type SSRChild } from "../src/ssr";
import {
  createComponent,
  getComponentContext,
  getContext,
  setContext,
} from "../src/component";
import { createRoot, createSignal, onCleanup } from "../src/reactive";
import { Show, mapArray } from "../src/control";
import "../../react/test/dom";

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

// Runtime closure/ownership contract only; this does not compile SFC snippets.
test("snippet closures retain lexical values but children inherit the live Show consumer", () => {
  let snippet!: () => DOMChild;
  let write!: (value: string) => string;
  let declarationCleanup = 0,
    childCleanup = 0,
    setups = 0;
  let stopDeclaration!: () => void;
  createRoot((stop) => {
    stopDeclaration = stop;
    disposers.push(stop);
    createComponent(
      () => {
        setContext("provider", "declaration");
        onCleanup(() => declarationCleanup++);
        const [lexical, setLexical] = createSignal("lexical");
        write = setLexical;
        snippet = () =>
          h(
            (props: { value: string }) => {
              setups++;
              const provider = getContext<string>("provider");
              expect(getComponentContext().mode).toBe("dom");
              onCleanup(() => childCleanup++);
              return h("p", null, () => `${props.value}/${provider}`);
            },
            {
              get value() {
                return lexical();
              },
            },
          );
      },
      {},
      "dom",
    );
  });
  const [visible, setVisible] = createSignal(true);
  const container = document.createElement("main");
  document.body.append(container);
  const stopConsumer = render(
    () =>
      h(() => {
        setContext("provider", "consumer");
        return h(
          "section",
          null,
          Show({ when: visible, children: () => snippet() }),
        );
      }, {}),
    container,
  );
  disposers.push(stopConsumer);
  const first = container.querySelector("p");
  expect(first?.textContent).toBe("lexical/consumer");
  write("updated");
  expect(container.querySelector("p")).toBe(first);
  expect(first?.textContent).toBe("updated/consumer");
  expect(setups).toBe(1);
  stopDeclaration();
  expect(declarationCleanup).toBe(1);
  expect(childCleanup).toBe(0);
  expect(first?.isConnected).toBe(true);
  setVisible(false);
  expect(childCleanup).toBe(1);
  expect(container.querySelector("p")).toBeNull();
  setVisible(true);
  expect(container.querySelector("p")?.textContent).toBe("updated/consumer");
  expect(setups).toBe(2);
  stopConsumer();
  stopConsumer();
  expect(childCleanup).toBe(2);
  expect(declarationCleanup).toBe(1);
});

test("SSR deferred snippet children inherit consumer context and mode, with request cleanup", () => {
  let cleanups = 0;
  function Declarer() {
    setContext("provider", "declaration");
    const lexical = "lexical";
    const snippet = () =>
      serverH(() => {
        const frame = getComponentContext();
        onCleanup(() => cleanups++);
        return serverH(
          "p",
          null,
          `${lexical}/${getContext("provider")}/${frame.mode}`,
        );
      }, {});
    return serverH(Consumer, { snippet });
  }
  function Consumer(props: { snippet: () => SSRChild }) {
    setContext("provider", "consumer");
    return serverH(
      "section",
      null,
      defer(() => props.snippet()),
    );
  }
  for (let request = 0; request < 2; request++) {
    expect(renderToString(() => serverH(Declarer, {}))).toBe(
      "<section><p>lexical/consumer/ssr</p></section>",
    );
    expect(cleanups).toBe(request + 1);
  }
});

test("failed deferred snippet component cleans up and restores its consumer carrier", () => {
  let failedCleanup = 0,
    siblingCleanup = 0;
  const failure = new Error("snippet setup");
  const html = renderToString(() =>
    serverH(() => {
      setContext("provider", "consumer");
      return serverH(
        "section",
        null,
        defer(() => {
          expect(() =>
            serverH(() => {
              setContext("provider", "failed child");
              onCleanup(() => {
                failedCleanup++;
                throw new Error("cleanup");
              });
              throw failure;
            }, {}),
          ).toThrow(failure);
          return serverH(() => {
            onCleanup(() => siblingCleanup++);
            return serverH(
              "p",
              null,
              `${getContext("provider")}/${getComponentContext().mode}`,
            );
          }, {});
        }),
      );
    }, {}),
  );
  expect(html).toBe("<section><p>consumer/ssr</p></section>");
  expect(failedCleanup).toBe(1);
  expect(siblingCleanup).toBe(1);
});

test("getter arguments preserve snippet nodes and component state while function identity owns replacement", () => {
  type Snippet = (argument: () => string) => DOMChild;
  const [argument, setArgument] = createSignal("first");
  const [selected, select] = createSignal<Snippet | undefined>(undefined);
  const cleanups: string[] = [];
  let setups = 0;
  function snippet(label: string): Snippet {
    return (getArgument) =>
      h(() => {
        setups++;
        const [local, setLocal] = createSignal(0);
        onCleanup(() => cleanups.push(label));
        return h(
          "div",
          null,
          h("input", { value: () => `${label}/${getArgument()}/${local()}` }),
          h(
            "button",
            { onClick: () => setLocal((value) => value + 1) },
            "local",
          ),
        );
      }, {});
  }
  const first = snippet("one"),
    second = snippet("two");
  const container = document.createElement("main");
  document.body.append(container);
  const stop = render(
    () =>
      h(
        "section",
        null,
        mapArray(
          () => {
            const fn = selected();
            return fn ? [fn] : [];
          },
          (fn) => fn(argument),
        ),
      ),
    container,
  );
  disposers.push(stop);
  expect(container.querySelector("input")).toBeNull();
  select(() => first);
  const input = container.querySelector("input")!;
  const button = container.querySelector("button")!;
  input.focus();
  button.click();
  expect(input.value).toBe("one/first/1");
  setArgument("updated");
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("one/updated/1");
  expect(document.activeElement).toBe(input);
  expect(setups).toBe(1);
  expect(cleanups).toEqual([]);
  select(() => first);
  expect(container.querySelector("input")).toBe(input);
  select(() => second);
  const replacement = container.querySelector("input")!;
  expect(replacement).not.toBe(input);
  expect(replacement.value).toBe("two/updated/0");
  expect(cleanups).toEqual(["one"]);
  select(undefined);
  expect(container.querySelector("input")).toBeNull();
  expect(cleanups).toEqual(["one", "two"]);
  select(() => first);
  expect(container.querySelector("input")?.value).toBe("one/updated/0");
  stop();
  stop();
  setArgument("disposed");
  select(() => second);
  expect(setups).toBe(3);
  expect(cleanups).toEqual(["one", "two", "one"]);
  expect(container.childNodes).toHaveLength(0);
});

test("SSR snippet getter arguments escape under consumer context with isolated request cleanup", () => {
  const cleanups: string[] = [];
  for (const request of ["<first>&", '<second>"']) {
    function Declare() {
      setContext("provider", "declaration");
      const snippet = (argument: () => string) =>
        serverH(() => {
          onCleanup(() => cleanups.push(request));
          return serverH(
            "p",
            { title: argument() },
            `${argument()}/${getContext("provider")}/${getComponentContext().mode}`,
          );
        }, {});
      return serverH(Consume, { snippet, argument: () => request });
    }
    function Consume(props: {
      snippet: (argument: () => string) => SSRChild;
      argument: () => string;
    }) {
      setContext("provider", request);
      return serverH(
        "section",
        null,
        defer(() => props.snippet(props.argument)),
      );
    }
    const escaped =
      request === "<first>&" ? "&lt;first&gt;&amp;" : "&lt;second&gt;&quot;";
    expect(renderToString(() => serverH(Declare, {}))).toBe(
      `<section><p title="${escaped}">${escaped}/${escaped}/ssr</p></section>`,
    );
  }
  expect(cleanups).toEqual(["<first>&", '<second>"']);
});
