import { invokeSnippetSSR } from "../src/raw-snippet-ssr";
import { createRawSnippet } from "../src/raw-snippet";
import { test } from "bun:test";
import assert from "node:assert/strict";
import { h, renderToString, settle } from "@tschk/moonshine-dom/ssr";
import { getOwner } from "@tschk/moonshine-dom/reactive";
import {
  peekComponentContext,
  setContext,
  getContext,
} from "@tschk/moonshine-dom/component";
import { captureSSRRenderAttempt } from "@tschk/moonshine-dom/ssr-attempt";
import { onDestroy } from "@tschk/moonshine-svelte/svelte";
import { invokeRawSSR as bridgeSSR } from "../src/raw-snippet-ssr";
test("ssr-restoration", () => {
  const trace: string[] = [];
  function Consumer() {
    setContext("test", "consumer");
    const consumer = peekComponentContext()!;
    onDestroy(() => trace.push("consumer"));
    return settle(() =>
      h(() => {
        setContext("test", "wrapper");
        const owner = getOwner()!,
          context = owner.context,
          frame = peekComponentContext(),
          attempt = captureSSRRenderAttempt();
        const check = () => {
          assert.equal(getOwner(), owner);
          assert.equal(owner.context, context);
          assert.equal(peekComponentContext(), frame);
          assert.equal(captureSSRRenderAttempt(), attempt);
          assert.equal(getContext("test"), "wrapper");
          assert.equal(consumer.active, false);
        };
        for (const phase of ["factory", "render"]) {
          assert.throws(
            () =>
              invokeRawSSR<[]>(
                () => {
                  assert.equal(getContext("test"), "consumer");
                  onDestroy(() => trace.push(phase));
                  if (phase === "factory") throw Error(phase);
                  return {
                    render() {
                      throw Error(phase);
                    },
                    get setup(): never {
                      throw Error("setup");
                    },
                  };
                },
                [],
                consumer,
              ),
            new RegExp(phase),
          );
          check();
        }
        const raw = invokeRawSSR<[]>(
          () => {
            const outerContext = owner.context;
            assert.equal(peekComponentContext(), consumer);
            invokeRawSSR<[]>(
              () => ({
                render() {
                  assert.equal(getContext("test"), "consumer");
                  onDestroy(() => trace.push("nested"));
                  return "<i>nested</i>";
                },
                get setup(): never {
                  throw Error("setup");
                },
              }),
              [],
              consumer,
            );
            assert.equal(owner.context, outerContext);
            assert.equal(peekComponentContext(), consumer);
            assert.equal(consumer.active, true);
            return {
              render() {
                return " <b>outer</b> ";
              },
              get setup(): never {
                throw Error("setup");
              },
            };
          },
          [],
          consumer,
        );
        check();
        return raw;
      }, {}),
    );
  }
  assert.equal(
    renderToString(() => h(Consumer, {})),
    "<b>outer</b>",
  );
  assert.deepEqual(trace, ["consumer", "factory", "render", "nested"]);
  console.log(
    JSON.stringify({ restored: true, nested: true, setupRead: false, trace }),
  );
});

function invokeRawSSR<P extends unknown[]>(
  factory: any,
  values: P,
  consumer: any,
) {
  return bridgeSSR(createRawSnippet<P>(factory), values, consumer);
}

test("mixed ordinary/raw SSR dispatch keeps source values and never reads setup", () => {
  const snippet = createRawSnippet<[number]>((read) => ({
    render: () => "<b>" + read() + "</b>",
    get setup(): never {
      throw Error("setup read");
    },
  }));
  assert.equal(
    renderToString(() =>
      h(() => {
        const consumer = peekComponentContext()!;
        return [
          invokeSnippetSSR((value: number) => h("i", {}, value), [2], consumer),
          invokeSnippetSSR(snippet, [3], consumer),
        ];
      }, {}),
    ),
    "<i>2</i><b>3</b>",
  );
});
