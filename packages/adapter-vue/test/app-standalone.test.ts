import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("native application entry imports with src/manifests only and no DOM or host runtime", async () => {
  const root = join(import.meta.dir, ".."),
    dir = await mkdtemp(join(tmpdir(), "moonshine-native-app-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", join(root, "../dom")],
      ["moonshine-vue", root],
    ]) {
      const to = join(dir, "node_modules/@tschk", name!);
      await cp(join(source!, "src"), join(to, "src"), { recursive: true });
      await cp(join(source!, "package.json"), join(to, "package.json"));
    }
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-install",
        "-e",
        `import assert from 'node:assert/strict';import{createApp}from'@tschk/moonshine-vue/app';for(const name of ['vue','react','react-dom','@tschk/crepuscularity-wasm','@tschk/moonshine-framework'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));const app=createApp(()=>null,{});assert.deepEqual(Object.keys(app),['mount','unmount']);app.unmount();assert.throws(()=>app.mount('#none'),/requires a DOM/);`,
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const [o, e, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, o + e).toBe(0);
    expect(e).toBe("");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unsupported rejected promises are observed without assimilating authored thenables", async () => {
  const component = join(import.meta.dir, "../src/app.ts"),
    dom = join(import.meta.dir, "../../react/test/dom.ts");
  const script = `import assert from 'node:assert/strict';import ${JSON.stringify(dom)};import{createApp}from ${JSON.stringify(component)};const unhandled=[];process.on('unhandledRejection',reason=>unhandled.push(reason));let reads=0;const own=Promise.reject(Error('own then'));Object.defineProperty(own,'then',{get(){reads++;throw Error('must not read then')}});for(const factory of [()=>Promise.reject(Error('already rejected')),async()=>{throw Error('async thrown')},()=>own,()=>({get then(){reads++;throw Error('unknown thenable')}})]){const element=document.createElement('main');const app=createApp(factory,{});assert.throws(()=>app.mount(element),/promises or VNodes/);assert.equal(element.innerHTML,'');app.unmount()}await new Promise(resolve=>setTimeout(resolve,0));assert.equal(reads,0);assert.deepEqual(unhandled,[]);`;
  const child = Bun.spawn([process.execPath, "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [o, e, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, o + e).toBe(0);
  expect(e).toBe("");
});
