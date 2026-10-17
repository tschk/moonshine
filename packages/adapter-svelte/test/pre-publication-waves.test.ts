import { expect, test } from "bun:test";
import {
  createRoot,
  createSignal,
  createRenderEffect,
} from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import {
  componentRef,
  exposeComponent,
} from "@tschk/moonshine-dom/component-instance";
import { Show } from "@tschk/moonshine-dom/control";
import { h, render } from "@tschk/moonshine-dom/dom";
import { createState, createRuneEffect } from "../src/runes";
import { withRuneScheduler, createRunePreEffect } from "../src/pre";
import { onMount } from "../src/svelte";
import "../../react/test/dom";
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function Publisher() {
  exposeComponent({});
  return null;
}

test("reference posts defer pre and text while structural selection follows owner order", async () => {
  for (const conditionalFirst of [true, false]) {
    const value = createState(0),
      shown = createState(true),
      instance = createState<{ ready: boolean } | null>(null);
    const trace: unknown[][] = [];
    const target = document.createElement("main");
    function Child() {
      createRunePreEffect(() => {
        void value.value;
      });
      createRuneEffect(() => trace.push(["child-post", value.value]));
      onMount(() => trace.push(["mount", !!instance.value]));
      exposeComponent({ ready: true });
      return h("b", null, () => value.value);
    }
    function Parent() {
      createRunePreEffect(() =>
        trace.push(["pre", value.value, !!instance.value]),
      );
      createRuneEffect(() =>
        trace.push([
          "post",
          value.value,
          !!instance.value,
          target.querySelector("i")?.textContent,
          target.querySelector("aside")?.textContent,
        ]),
      );
      const text = h("i", null, () => (instance.value ? "ready" : "missing"));
      const conditional = () =>
        Show({
          when: () => instance.value,
          children: () => h("aside", null, "ready"),
          fallback: () => h("aside", null, "missing"),
        });
      const child = () =>
        Show({
          when: () => shown.value,
          children: () =>
            h(Child, {
              [componentRef]: {
                publication: "post",
                cleanup: "commit",
                get: () => instance.value,
                set: (next: { ready: boolean } | null) =>
                  (instance.value = next),
              },
            }),
        });
      return h(
        "section",
        null,
        text,
        ...(conditionalFirst
          ? [conditional(), child()]
          : [child(), conditional()]),
      );
    }
    const stop = render(() => withRuneScheduler(() => h(Parent, {})), target);
    await tick();
    expect(trace).toEqual([
      ["pre", 0, false],
      ["child-post", 0],
      ["mount", false],
      ["post", 0, true, "missing", "ready"],
      ["pre", 0, true],
    ]);
    expect(target.querySelector("i")?.textContent).toBe("ready");
    trace.length = 0;
    value.value = 1;
    shown.value = false;
    await tick();
    expect(trace).toEqual([
      ["pre", 1, true],
      ["post", 1, false, "missing", conditionalFirst ? "ready" : "missing"],
      ["pre", 1, false],
    ]);
    expect(target.querySelector("aside")?.textContent).toBe("missing");
    trace.length = 0;
    shown.value = true;
    await tick();
    expect(trace).toEqual([
      ["child-post", 1],
      ["mount", false],
      ["post", 1, true, "missing", "ready"],
      ["pre", 1, true],
    ]);
    stop();
  }
});

test("deferred pre stays exclusive when structural setup invalidates it again", async () => {
  const [n, setN] = createSignal(0),
    [shown, show] = createSignal(false);
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      createRunePreEffect(() => trace.push("pre:" + n()));
      const branch = Show({
        when: shown,
        children: () => {
          trace.push("structural");
          createRunePreEffect(() => {
            trace.push("nested-pre");
            setN(2);
          });
          return null;
        },
      });
      createRenderEffect(() => branch());
      createComponent(
        Publisher,
        {
          [componentRef]: {
            publication: "post",
            get: () => null,
            set: () => {
              setN(1);
              show(true);
            },
          },
        },
        "dom",
      );
      createRuneEffect(() => trace.push("post:" + n()));
    });
  });
  await tick();
  expect(trace).toEqual([
    "pre:0",
    "structural",
    "nested-pre",
    "post:2",
    "pre:2",
  ]);
  stop();
});

test("disposal cancels deferred pre/render jobs before a later pass", async () => {
  const [n, setN] = createSignal(0);
  let stop!: () => void;
  const trace: string[] = [];
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      createRunePreEffect(() => trace.push("pre:" + n()));
      createRenderEffect(() => trace.push("dom:" + n()));
      createComponent(
        Publisher,
        {
          [componentRef]: {
            publication: "post",
            get: () => null,
            set: () => setN(1),
          },
        },
        "dom",
      );
      createRuneEffect(() => {
        trace.push("stop-post");
        stop();
      });
    });
  });
  await tick();
  setN(2);
  await tick();
  expect(trace).toEqual(["pre:0", "dom:0", "stop-post"]);
});

test("initial pre-only owners leave no completed marker in unrelated render passes", async () => {
  const [n, setN] = createSignal(0),
    [trigger, start] = createSignal(false);
  let stopA!: () => void, stopB!: () => void;
  const trace: string[] = [];
  createRoot((stop) => {
    stopA = stop;
    withRuneScheduler(() =>
      createRunePreEffect(() => trace.push("pre:" + n())),
    );
  });
  await tick();
  createRoot((stop) => {
    stopB = stop;
    withRuneScheduler(() => {
      createRenderEffect(() => {
        if (trigger()) setN(1);
      });
      createRuneEffect(() => {
        if (trigger()) trace.push("post");
      });
    });
  });
  await tick();
  trace.length = 0;
  start(true);
  await tick();
  expect(trace).toEqual(["pre:1", "post"]);
  stopA();
  stopB();
});
