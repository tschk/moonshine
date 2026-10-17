import { expect, test } from "bun:test";
import {
  ErrorBoundary as SolidBoundary,
  createRoot,
  createSignal,
} from "../src/solid";

import { createComponent } from "@tschk/moonshine-dom/component";
test("fallback getter tracks only failure branch while callback body is untracked", () => {
  const [bad, setBad] = createSignal(false),
    [label, setLabel] = createSignal("a"),
    [body, setBody] = createSignal(0);
  let reads = 0,
    calls = 0,
    stop!: () => void,
    view!: () => string | undefined;
  createRoot((d) => {
    stop = d;
    view = SolidBoundary({
      get children() {
        if (bad()) throw "bad";
        return "child";
      },
      get fallback() {
        reads++;
        const captured = label();
        return (_e: Error) => {
          calls++;
          body();
          return captured;
        };
      },
    });
  });
  setLabel("b");
  expect(reads).toBe(0);
  setBad(true);
  expect(view()).toBe("b");
  setBody(1);
  expect(calls).toBe(1);
  setLabel("c");
  expect(view()).toBe("c");
  expect(reads).toBe(2);
  stop();
});
test("SSR component boundary rejects before constructing children", () => {
  let children = 0;
  expect(() =>
    createRoot(() =>
      createComponent(
        () =>
          SolidBoundary({
            get children() {
              children++;
              return "child";
            },
            fallback: "failed",
          }),
        {},
        "ssr",
      ),
    ),
  ).toThrow("does not support SSR");
  expect(children).toBe(0);
});
import { resolve } from "node:path";
const program = (
  specifier: string,
) => `import{ErrorBoundary,catchError,createRoot,createSignal,createEffect,onCleanup}from ${JSON.stringify(specifier)};
 const trace=[];let stop,reset,view;const[bad,setBad]=createSignal(false),[label,setLabel]=createSignal('a'),[body,setBody]=createSignal(0);
 createRoot(d=>{stop=d;view=ErrorBoundary({get children(){trace.push('setup');onCleanup(()=>trace.push('child-clean'));createEffect(()=>{if(bad())throw 'bad'});return 'child'},get fallback(){const value=label();trace.push('getter:'+value);return(e,r)=>{reset=r;body();onCleanup(()=>trace.push('fallback-clean'));trace.push('fallback:'+e.message);return value}}});});
 const values=[view()];setLabel('b');values.push(view());setBad(true);values.push(view());setBody(1);values.push(view());setLabel('c');values.push(view());setBad(false);values.push(view());reset();values.push(view());stop();
 createRoot(d=>{catchError(()=>catchError(()=>{throw {reason:1}},e=>{trace.push(e.message+':'+e.cause.reason);throw 'outer'}),e=>trace.push(e.message));stop=d;});stop();console.log(JSON.stringify({trace,values}));`;
test("public boundary lifecycle, fallback tracking and handler normalization match installed Solid", async () => {
  async function execute(specifier: string) {
    const child = Bun.spawn(
      [process.execPath, "--conditions=browser", "--eval", program(specifier)],
      {
        cwd: resolve(import.meta.dir, "../../.."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const out = await new Response(child.stdout).text();
    const err = await new Response(child.stderr).text();
    expect(await child.exited, err).toBe(0);
    return JSON.parse(out);
  }
  const native = await execute(resolve(import.meta.dir, "../src/solid.ts"));
  const reference = await execute(
    resolve(import.meta.dir, "../../../node_modules/solid-js/dist/solid.js"),
  );
  expect(native).toEqual(reference);
});
