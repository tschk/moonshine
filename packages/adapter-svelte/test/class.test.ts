import { expect, test } from "bun:test";
import { classValue } from "../src/class";
import { createState } from "../src/state";
import { createRoot, createComputed } from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as serverH, renderToString } from "@tschk/moonshine-dom/ssr";
import "../../react/test/dom";

test("class expressions match actual Svelte 5.57 primitives, arrays and inherited flags", async () => {
  const pkg = Bun.resolveSync(
    "svelte/package.json",
    `${import.meta.dir}/../../../examples/svelte-adopt`,
  );
  expect((await Bun.file(pkg).json()).version).toBe("5.57.1");
  const attributes = new URL(
    "./src/internal/shared/attributes.js",
    `file://${pkg}`,
  ).pathname;
  const setup = `const fn=()=>{throw Error('literal')};const inherited=Object.create({inherited:true,off:false});inherited.own=1;const getter={get active(){return true}};const values=[null,undefined,'',false,true,0,-0,NaN,2,2n,fn,['base',false,['active',{large:true,hidden:false}]],{a:true,b:0},[0,false,null,undefined,NaN,2n,fn,true],inherited,getter,[],{}];`;
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-install",
      "-e",
      `import{clsx,to_class}from${JSON.stringify(attributes)};${setup}console.log(JSON.stringify(values.map(value=>to_class(clsx(value))??null)));`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(error).toBe("");
  expect(code).toBe(0);
  const fn = () => {
    throw Error("literal");
  };
  const inherited = Object.create({ inherited: true, off: false });
  inherited.own = 1;
  const values = [
    null,
    undefined,
    "",
    false,
    true,
    0,
    -0,
    NaN,
    2,
    2n,
    fn,
    ["base", false, ["active", { large: true, hidden: false }]],
    { a: true, b: 0 },
    [0, false, null, undefined, NaN, 2n, fn, true],
    inherited,
    {
      get active() {
        return true;
      },
    },
    [],
    {},
  ];
  // Function source formatting differs between the child evaluation and this test;
  // compare its literal identity semantics independently below.
  const expected = JSON.parse(out);
  expect(expected[10]).toContain("literal");
  expected.splice(10, 1);
  values.splice(10, 1);
  expect(values.map((value) => classValue(value) ?? null)).toEqual(expected);
  expect(classValue(fn)).toBe(`${fn}`);
  expect(classValue([fn])).toBeUndefined();
  expect(() => classValue(Symbol("class"))).toThrow(TypeError);
});

test("class normalization tracks state getters once and updates native DOM without an empty class", () => {
  const state = createState({ enabled: false });
  let reads = 0;
  const flags = {
    get active() {
      reads++;
      return state.value.enabled;
    },
  };
  const history: Array<string | undefined> = [];
  const stop = createRoot((dispose) => {
    createComputed(() => history.push(classValue(flags)));
    return dispose;
  });
  expect(history).toEqual([undefined]);
  expect(reads).toBe(1);
  state.value.enabled = true;
  expect(history).toEqual([undefined, "active"]);
  expect(reads).toBe(2);
  stop();
  const container = document.createElement("main");
  document.body.append(container);
  const dispose = render(
    () =>
      h(
        "p",
        { class: () => classValue([state.value.enabled && "active"]) },
        "content",
      ),
    container,
  );
  expect(container.firstElementChild!.getAttribute("class")).toBe("active");
  state.value.enabled = false;
  expect(container.firstElementChild!.hasAttribute("class")).toBe(false);
  dispose();
  container.remove();
  expect(
    renderToString(() => serverH("p", { class: classValue([]) }, "empty")),
  ).toBe("<p>empty</p>");
  expect(
    renderToString(() => serverH("p", { class: classValue({ "<&": true }) })),
  ).toBe('<p class="&lt;&amp;"></p>');
});
