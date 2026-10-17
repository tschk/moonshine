import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("source compatibility renderer loads JavaScript pages on Node without host packages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moonshine-source-node-"));
  try {
    const entry = join(directory, "entry.ts");
    await writeFile(
      entry,
      `
export {sourceRenderer} from ${JSON.stringify(resolve(import.meta.dir, "../src/framework-source.ts"))};
export {h,onCleanup} from ${JSON.stringify(resolve(import.meta.dir, "../src/ssr.ts"))};
`,
    );
    const built = await Bun.build({
      entrypoints: [entry],
      target: "node",
      format: "esm",
      minify: true,
    });
    expect(built.success).toBe(true);
    await writeFile(
      join(directory, "library.mjs"),
      await built.outputs[0]!.text(),
    );
    await writeFile(
      join(directory, "page.mjs"),
      `
import {h,onCleanup} from './library.mjs';
export const metadata={title:'Node<&'};
export default function Page({data}){onCleanup(()=>globalThis.cleaned++);return h('p',null,data.name);}
`,
    );
    await writeFile(
      join(directory, "check.mjs"),
      `
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceRenderer} from './library.mjs';
globalThis.cleaned=0;
const context={request:new Request('http://localhost/'),route:{id:'home',path:'/',file:fileURLToPath(new URL('./page.mjs',import.meta.url)),mode:'ssr',runtime:'node',decision:'test',clientEntries:[]},params:{},data:{name:'<first>&'},signal:new AbortController().signal};
const html=await sourceRenderer.prerender(context);
assert.ok(html.includes('<title>Node&lt;&amp;</title>'));assert.ok(html.includes('<p>&lt;first&gt;&amp;</p>'));
const response=await sourceRenderer.render({...context,data:{name:'second'}});
assert.ok((await response.text()).includes('<p>second</p>'));assert.equal(globalThis.cleaned,2);
console.log('Node source renderer: escaped metadata/data, page loading and per-request cleanup passed');
`,
    );
    const child = Bun.spawn(
      [Bun.which("node")!, join(directory, "check.mjs")],
      {
        cwd: directory,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [status, output, errors] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(errors).toBe("");
    expect(status).toBe(0);
    expect(output).toContain("per-request cleanup passed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
