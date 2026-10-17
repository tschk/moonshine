import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function standalone(script: string, framework = false) {
  const root = join(import.meta.dir, "..");
  const dir = await mkdtemp(join(tmpdir(), "moonshine-astro-independent-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", join(root, "../dom")],
      ["moonshine-astro", root],
      ...(framework
        ? [["moonshine-framework", join(root, "../framework")]]
        : []),
    ]) {
      const target = join(dir, "node_modules/@tschk", name!);
      await cp(join(source!, "src"), join(target, "src"), { recursive: true });
      await cp(join(source!, "package.json"), join(target, "package.json"));
    }
    const child = Bun.spawn([Bun.which("bun")!, "--no-install", "-e", script], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
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
}

test("root bridges load without hosts, React, parser WASM or the optional framework", async () => {
  const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();
  expect(Object.keys(pkg.dependencies).toSorted()).toEqual([
    "@tschk/moonshine",
    "@tschk/moonshine-dom",
  ]);
  expect(pkg.peerDependenciesMeta["@tschk/moonshine-framework"]).toEqual({
    optional: true,
  });
  await standalone(`
    import assert from 'node:assert/strict';
    import * as root from '@tschk/moonshine-astro';
    for(const name of ['@angular/core','@angular/common','astro','nuxt','vue','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine','@tschk/moonshine-framework'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
    const entry=process.cwd()+'/bridge.ts';
    await Bun.write(entry,"export {createBridgedReadable} from '@tschk/moonshine-astro';");
    for(const target of ['browser','bun','node']){
      const built=await Bun.build({entrypoints:[entry],target,minify:true});
      assert.equal(built.success,true,String(built.logs));
      const source=await built.outputs[0].text();
      for(const forbidden of ['framework-source','@tschk/moonshine-framework','react-dom','@tschk/crepus','Server children'])assert.ok(!source.includes(forbidden),target+': '+forbidden);
    }
    assert.equal(root.crepusRenderer.name,'crepus');
    assert.equal(typeof root.crepusRenderer.render,'function');
    const value=root.createBridgedReadable(1),seen=[];const stop=value.subscribe(n=>seen.push(n));assert.equal(value.get(),1);stop();assert.deepEqual(seen,[1]);
  `);
});

test("optional framework renderer serves native SSR, API and SPA and rejects legacy React output", async () => {
  await standalone(
    `
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {crepusRenderer} from '@tschk/moonshine-astro';
for(const name of ['@angular/core','@angular/common','astro','nuxt','vue','svelte','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
const page=join(process.cwd(),'page.ts');
await writeFile(page,\`import {h} from '@tschk/moonshine-dom/ssr';
export const metadata={title:'native <title>',description:'safe<&'};
export default function Page({data}){return h('p',null,data.name);}\`);
const context={request:new Request('https://example.com/'),route:{id:'home',path:'/',file:page,mode:'ssr',runtime:'bun',decision:'standalone',clientEntries:[]},params:{},data:{name:'<alice>&'},signal:new AbortController().signal};
const response=await crepusRenderer.render(context);assert.equal(response.status,200);
const html=await response.text();assert.ok(html.includes('<title>native &lt;title&gt;</title>'));assert.ok(html.includes('<p>&lt;alice&gt;&amp;</p>'));assert.ok(html.includes('content="safe&lt;&amp;"'));
const legacy=join(process.cwd(),'legacy.ts');
await writeFile(legacy,\`export default function Page(){return {$$typeof:Symbol.for('react.transitional.element'),type:'p',props:{children:'legacy'}}}\`);
await assert.rejects(()=>crepusRenderer.prerender({...context,route:{...context.route,file:legacy}}),/Server children must be text or factory HTML/);
const api=await crepusRenderer.render({...context,route:{...context.route,mode:'api'}});assert.ok(api.headers.get('content-type').includes('application/json'));assert.deepEqual(await api.json(),context.data);
const spa=await crepusRenderer.prerender({...context,route:{...context.route,id:'counter',file:'missing-server-page.ts',mode:'spa',clientEntries:['/client.js']},params:{id:'2'},data:{name:'</script>'}});
assert.ok(spa.includes('data-moonshine-app="counter"'));assert.ok(spa.includes('src="/client.js"'));
const payload=spa.split('data-moonshine-props>')[1].split('</script>')[0];assert.ok(!payload.includes('<'));assert.deepEqual(JSON.parse(payload),{params:{id:'2'},data:{name:'</script>'}});
`,
    true,
  );
});

test("native Astro SSR factories load without hosts, parser WASM or framework", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import {h,renderToString,classList,sourceChild} from '@tschk/moonshine-astro/ssr';
for(const name of ['astro','react','react-dom','@tschk/crepuscularity-wasm','@tschk/moonshine-framework'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
assert.equal(renderToString(()=>h('p',{'data-ready':()=>true},sourceChild([true,false,0,'<&']))),'<p data-ready="true">true0&lt;&amp;</p>');
assert.equal(classList(['a',{active:true}]),'a active');
`);
});
