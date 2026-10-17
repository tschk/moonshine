import { createRawSnippet } from "../src/raw-snippet";
import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  h,
  renderToString,
  settle,
  afterRender,
} from "@tschk/moonshine-dom/ssr";
import {
  peekComponentContext,
  getContext,
  setContext,
} from "@tschk/moonshine-dom/component";
import { captureSSRRenderAttempt } from "@tschk/moonshine-dom/ssr-attempt";
import { getOwner } from "@tschk/moonshine-dom/reactive";
import { onDestroy } from "@tschk/moonshine-svelte/svelte";
import { invokeRawSSR as bridgeSSR } from "../src/raw-snippet-ssr";
test("raw SSR retries preserve consumer lifecycle acceptance and fresh requests", () => {
  const records: unknown[] = [];
  for (const props of [
    { id: "one" },
    { id: "two" },
    { id: "abandoned", abandon: true },
    { id: "failure", kind: "factory" },
    { id: "failure", kind: "render" },
  ]) {
    const trace: unknown[] = [];
    let serial = 0;
    const factory = (read: () => number | undefined) => {
      const initial = read(),
        consumer = getContext<string>("raw-snippet-ssr-provider");
      trace.push(["factory", props.id, initial ?? "unset", consumer]);
      onDestroy(() =>
        trace.push(["raw-destroy", props.id, initial ?? "unset", consumer]),
      );
      if (props.kind === "factory") throw Error("raw factory failure");
      return {
        render() {
          if (props.kind === "render") throw Error("raw render failure");
          trace.push(["render", props.id, read() ?? "unset"]);
          return (
            " \n<b data-raw-snippet-ssr>" +
            String(read() ?? "unset") +
            "</b> \n"
          );
        },
        get setup(): never {
          throw Error("SSR setup read");
        },
      };
    };
    function Consumer() {
      const instance = ++serial;
      let value: number | undefined;
      setContext(
        "raw-snippet-ssr-provider",
        "consumer:" + props.id + ":" + instance,
      );
      const authored = peekComponentContext()!;
      onDestroy(() => trace.push(["consumer-destroy", props.id, instance]));
      return settle((invalidate) =>
        h(() => {
          setContext("raw-snippet-ssr-provider", "WRAPPER");
          const owner = getOwner(),
            attempt = captureSSRRenderAttempt(),
            frame = peekComponentContext();
          const raw = invokeRawSSR(factory, [value], authored);
          assert.equal(getOwner(), owner);
          assert.equal(captureSSRRenderAttempt(), attempt);
          assert.equal(peekComponentContext(), frame);
          assert.equal(getContext("raw-snippet-ssr-provider"), "WRAPPER");
          return [
            raw,
            afterRender(h("i", {}, value ?? 3), () => {
              if (value === undefined) {
                value = 3;
                invalidate();
              }
            }),
          ];
        }, {}),
      );
    }
    function Parent() {
      let outer: number | undefined;
      setContext("raw-snippet-ssr-provider", "declaration:" + props.id);
      return settle((invalidate) =>
        h(
          "section",
          { "data-raw-snippet-ssr": props.id, "data-outer": outer },
          h(Consumer, {}),
          props.abandon
            ? afterRender(h("i", {}, outer ?? 3), () => {
                if (outer === undefined) {
                  outer = 3;
                  invalidate();
                }
              })
            : [],
        ),
      );
    }
    let html: string | undefined, error: string | undefined;
    try {
      html = renderToString(() => h(Parent, {}));
    } catch (failure) {
      error = (failure as Error).message;
    }
    const record = { props, ...(error ? { error } : { html }), trace };
    records.push(record);
  }
  const official = [
    {
      props: { id: "one" },
      html: '<!--[--><section data-raw-snippet-ssr="one"><b data-raw-snippet-ssr>3</b><!----><i>3</i><!----><!----><!--[-1--><!--]--></section><!--]-->',
      trace: [
        ["factory", "one", "unset", "consumer:one:1"],
        ["render", "one", "unset"],
        ["factory", "one", 3, "consumer:one:1"],
        ["render", "one", 3],
        ["consumer-destroy", "one", 1],
        ["raw-destroy", "one", "unset", "consumer:one:1"],
        ["raw-destroy", "one", 3, "consumer:one:1"],
      ],
    },
    {
      props: { id: "two" },
      html: '<!--[--><section data-raw-snippet-ssr="two"><b data-raw-snippet-ssr>3</b><!----><i>3</i><!----><!----><!--[-1--><!--]--></section><!--]-->',
      trace: [
        ["factory", "two", "unset", "consumer:two:1"],
        ["render", "two", "unset"],
        ["factory", "two", 3, "consumer:two:1"],
        ["render", "two", 3],
        ["consumer-destroy", "two", 1],
        ["raw-destroy", "two", "unset", "consumer:two:1"],
        ["raw-destroy", "two", 3, "consumer:two:1"],
      ],
    },
    {
      props: { id: "abandoned", abandon: true },
      html: '<!--[--><section data-raw-snippet-ssr="abandoned" data-outer="3"><b data-raw-snippet-ssr>3</b><!----><i>3</i><!----><!----><!--[0--><i>3</i><!--]--></section><!--]-->',
      trace: [
        ["factory", "abandoned", "unset", "consumer:abandoned:1"],
        ["render", "abandoned", "unset"],
        ["factory", "abandoned", 3, "consumer:abandoned:1"],
        ["render", "abandoned", 3],
        ["factory", "abandoned", "unset", "consumer:abandoned:2"],
        ["render", "abandoned", "unset"],
        ["factory", "abandoned", 3, "consumer:abandoned:2"],
        ["render", "abandoned", 3],
        ["consumer-destroy", "abandoned", 2],
        ["raw-destroy", "abandoned", "unset", "consumer:abandoned:2"],
        ["raw-destroy", "abandoned", 3, "consumer:abandoned:2"],
      ],
    },
    {
      props: { id: "failure", kind: "factory" },
      error: "raw factory failure",
      trace: [["factory", "failure", "unset", "consumer:failure:1"]],
    },
    {
      props: { id: "failure", kind: "render" },
      error: "raw render failure",
      trace: [["factory", "failure", "unset", "consumer:failure:1"]],
    },
  ];
  for (let i = 0; i < records.length; i++) {
    const actual = records[i] as any,
      expected = official[i];
    assert.deepEqual(actual.trace, expected.trace);
    assert.equal(actual.error, expected.error);
    if (actual.html) {
      const normalized = expected.html.replace(/<!--[^]*?-->/g, "");
      assert.equal(actual.html, normalized);
    }
  }
});

function invokeRawSSR<P extends unknown[]>(
  factory: any,
  values: P,
  consumer: any,
) {
  return bridgeSSR(createRawSnippet<P>(factory), values, consumer);
}
