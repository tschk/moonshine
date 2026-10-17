import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("native JSX and component references check without React types", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-jsx-types-"));
  try {
    await writeFile(
      join(dir, "native.d.ts"),
      `import type {} from ${JSON.stringify(resolve(import.meta.dir, "../src/jsx-types"))};`,
    );
    await writeFile(
      join(dir, "source.tsx"),
      `import {For, Index, Show} from ${JSON.stringify(resolve(import.meta.dir, "../src/control"))};
import type {ComponentReference} from ${JSON.stringify(resolve(import.meta.dir, "../src/component-instance"))};
type Instance={method():void};
const fixed:ComponentReference<Instance>={get:()=>undefined,set:value=>value?.method()};
const path:ComponentReference<Instance,readonly [key:string,index:number]>={
 parts:()=>['row',0],
 get:(key,index)=>{key.toLowerCase();index.toFixed();return undefined},
 set:(value,key,index)=>{value?.method();key.toLowerCase();index.toFixed()}
};
fixed.set({method(){}});path.set(null,'row',0);
// @ts-expect-error Dynamic paths require their typed tuple arguments.
path.set(null);
// @ts-expect-error A tuple's numeric index cannot accept a string.
path.get('row','wrong');
export function Counter(props: {initial: number}) { return <button type="button">{props.initial}<svg><circle /></svg></button>; }
const valid = <Counter initial={0}/>;
const items = () => ["first", "second"];
const controls = <>
  <For each={items} children={(item, index) => <span>{item}{index()}</span>} />
  <Index each={items} children={(item, index) => <span>{item()}{index}</span>} />
  <Show when={() => "visible"} children={value => <span>{value()}</span>} fallback={() => <span>hidden</span>} />
</>;`,
    );
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "preserve",
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          types: [],
          lib: ["ESNext", "DOM"],
        },
        include: ["*.tsx", "*.d.ts"],
      }),
    );
    async function check() {
      const child = Bun.spawn(
        [
          process.execPath,
          resolve(import.meta.dir, "../../../node_modules/typescript/bin/tsc"),
          "--noEmit",
          "-p",
          join(dir, "tsconfig.json"),
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [code, output, error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, output: output + error };
    }
    const valid = await check();
    expect(valid.code, valid.output).toBe(0);
    await writeFile(
      join(dir, "bad.tsx"),
      `import {Counter} from './source'; const bad = <Counter initial="wrong"/>; const unknown = <notarealtag/>;
import type {ComponentReference} from ${JSON.stringify(resolve(import.meta.dir, "../src/component-instance"))};
const missingParts:ComponentReference<object,readonly [key:string]>={get:key=>undefined,set:(value,key)=>{}};`,
    );
    const invalid = await check();
    expect(invalid.code).not.toBe(0);
    expect(invalid.output).toContain("not assignable to type 'number'");
    expect(invalid.output).toContain("notarealtag");
    expect(invalid.output).toContain("Property 'parts' is missing");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
