import { expect, test } from "bun:test";
import { h, render } from "@tschk/moonshine-dom/dom";
import {
  componentRef,
  exposeComponent,
  type ComponentReference,
} from "@tschk/moonshine-dom/component-instance";
import { createSignal } from "@tschk/moonshine-dom/reactive";
import { withRuneScheduler } from "../src/pre";
import { createRuneEffect } from "../src/effect";
import { onMount } from "../src/svelte";
import "../../react/test/dom";
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function EmptyChild() {
  exposeComponent({});
  return h("b", null);
}
function ReadyChild() {
  exposeComponent({ ready: true });
  return h("b", null);
}

test("post references follow child lifecycle registration order and precede parent posts", async () => {
  for (const publication of [undefined, "post"] as const)
    for (const mountFirst of [false, true]) {
      let reference: { ready: boolean } | null | undefined;
      const trace: unknown[][] = [];
      function Child() {
        const mount = () => onMount(() => trace.push(["mount", !!reference]));
        const effect = () =>
          createRuneEffect(() => trace.push(["child-post", !!reference]));
        if (mountFirst) {
          mount();
          effect();
        } else {
          effect();
          mount();
        }
        exposeComponent({ ready: true });
        return h("b", null, "child");
      }
      function Parent() {
        createRuneEffect(() => trace.push(["parent-post", !!reference]));
        const binding: ComponentReference<{ ready: boolean }> = {
          publication,
          cleanup: "commit",
          get: () => reference,
          set: (next) => (reference = next),
        };
        return h(Child, { [componentRef]: binding });
      }
      const stop = render(
        () => withRuneScheduler(() => h(Parent, {})),
        document.createElement("div"),
      );
      await tick();
      const expected = publication !== "post";
      expect(trace).toEqual([
        ...(mountFirst
          ? [
              ["mount", expected],
              ["child-post", expected],
            ]
          : [
              ["child-post", expected],
              ["mount", expected],
            ]),
        ["parent-post", true],
      ]);
      expect(reference?.ready).toBe(true);
      stop();
      expect(reference).toBe(null);
    }
});

test("post publication cancels before first flush and validates its scheduler and option once", async () => {
  let writes = 0,
    reads = 0;
  const binding = {
    get publication() {
      reads++;
      return "post" as const;
    },
    get: () => null,
    set: () => writes++,
  };
  const stop = render(
    () => withRuneScheduler(() => h(EmptyChild, { [componentRef]: binding })),
    document.createElement("div"),
  );
  stop();
  await tick();
  expect(writes).toBe(0);
  expect(reads).toBe(1);
  expect(() =>
    render(
      () => h(EmptyChild, { [componentRef]: binding }),
      document.createElement("div"),
    ),
  ).toThrow("requires an opt-in render scheduler");
  expect(reads).toBe(2);
  expect(() =>
    render(
      () =>
        h(EmptyChild, {
          [componentRef]: { ...binding, publication: "invalid" },
        }),
      document.createElement("div"),
    ),
  ).toThrow("publication must be post");
});

test("post path references initialize, follow changed tuples and clear at commit", async () => {
  const [index, setIndex] = createSignal(0);
  const refs: Array<{ ready: boolean } | null | undefined> = [];
  const binding: ComponentReference<{ ready: boolean }, readonly [number]> = {
    publication: "post",
    cleanup: "commit",
    parts: () => [index()] as const,
    get: (position) => refs[position],
    set: (value, position) => (refs[position] = value),
  };
  const stop = render(
    () => withRuneScheduler(() => h(ReadyChild, { [componentRef]: binding })),
    document.createElement("div"),
  );
  expect(refs).toEqual([]);
  await tick();
  const instance = refs[0];
  expect(instance?.ready).toBe(true);
  setIndex(1);
  await tick();
  expect(refs).toEqual([null, instance]);
  stop();
  expect(refs).toEqual([null, null]);
  const stopped = render(
    () => withRuneScheduler(() => h(ReadyChild, { [componentRef]: binding })),
    document.createElement("div"),
  );
  stopped();
  await tick();
  expect(refs).toEqual([null, null]);
});

test("throwing post setters drain scalar/path peers and preserve cleanup", async () => {
  for (const path of [false, true]) {
    const code = `import{createRoot}from'@tschk/moonshine-dom/reactive';import{createComponent}from'@tschk/moonshine-dom/component';import{componentRef,exposeComponent}from'@tschk/moonshine-dom/component-instance';import{withRuneScheduler}from'@tschk/moonshine-svelte/pre';let peer=null,stop;const errors=[];process.once('uncaughtException',error=>errors.push(error.message));function Child(){exposeComponent({ready:true});return 'child'}createRoot(dispose=>{stop=dispose;withRuneScheduler(()=>{createComponent(Child,{[componentRef]:{publication:'post',cleanup:'commit',...(${path}?{parts:()=>[0]}:{}),get:()=>null,set:value=>{if(value)throw Error('setter failed')}}},'dom');createComponent(Child,{[componentRef]:{publication:'post',cleanup:'commit',get:()=>peer,set:value=>peer=value}},'dom')})});setTimeout(()=>{const published=peer?.ready===true;stop();console.log(JSON.stringify({errors,published,cleared:peer===null}))},10);`;
    const child = Bun.spawn(
      [process.execPath, "--no-install", "--eval", code],
      { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, codeValue] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(codeValue).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      errors: ["setter failed"],
      published: true,
      cleared: true,
    });
  }
});
