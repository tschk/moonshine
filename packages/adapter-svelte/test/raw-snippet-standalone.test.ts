import { test, expect } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("raw source descriptor and separate DOM/SSR invocation entries load without hosts or framework", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-raw-independent-"));
  try {
    for (const [name, pkg] of [
      ["moonshine", "core"],
      ["moonshine-dom", "dom"],
      ["moonshine-svelte", "adapter-svelte"],
    ]) {
      const source = join(import.meta.dir, "../../", pkg!),
        target = join(dir, "node_modules/@tschk", name!);
      await cp(join(source, "src"), join(target, "src"), { recursive: true });
      await cp(join(source, "package.json"), join(target, "package.json"));
    }
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-install",
        "-e",
        `
 import assert from 'node:assert/strict';
 import {existsSync} from 'node:fs';
 import {createRawSnippet} from '@tschk/moonshine-svelte/raw-snippet';
 import {invokeRawDOM} from '@tschk/moonshine-svelte/raw-snippet-dom';
 import {invokeRawSSR} from '@tschk/moonshine-svelte/raw-snippet-ssr';
 import {onDestroy} from '@tschk/moonshine-svelte/svelte';
 import {h,renderToString} from '@tschk/moonshine-dom/ssr';
 import {peekComponentContext} from '@tschk/moonshine-dom/component';
 for(const pkg of ['svelte','react','react-dom','@tschk/moonshine-framework','@tschk/crepuscularity-wasm'])assert.equal(existsSync('node_modules/'+pkg),false);
 assert.equal(typeof document,'undefined');assert.equal(typeof invokeRawDOM,'function');
 const trace=[];const snippet=createRawSnippet(read=>{onDestroy(()=>trace.push('raw'));return {render:()=> ' <b>'+read()+'</b> ',get setup(){throw Error('setup read')}}});
 assert.throws(()=>snippet(2),/compiler-lowered/);
 assert.equal(renderToString(()=>h(()=>{onDestroy(()=>trace.push('consumer'));return invokeRawSSR(snippet,[2],peekComponentContext())},{})),'<b>2</b>');
 assert.deepEqual(trace,['consumer','raw']);
 `,
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, output + error).toBe(0);
    expect(error).toBe("");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
