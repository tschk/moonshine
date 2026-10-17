import { expect, test } from "bun:test";
import { cp, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prepareNativeArtifact } from "../../deploy-bun/test/native-fixture";
import { vercelAdapter } from "../src/index";

test("native Vercel Node function runs relocated without host packages", async () => {
  const prepared = await prepareNativeArtifact();
  try {
    const builder = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
const {vercelAdapter}=await import(process.argv[1]);
const out=process.argv[2];
const manifest=await Bun.file(out+'/manifest.json').json();
for(const route of manifest.routes)route.runtime='node';
for(const asset of manifest.assets){if(!await Bun.file(out+'/'+asset.file).exists() && await Bun.file(out+'/public/'+asset.file).exists())asset.file='public/'+asset.file;}
await Bun.write(out+'/.vercel/output/static/dist/server.js','STALE_PRIVATE_SERVER');
await vercelAdapter.build(manifest,out);
`,
        resolve(import.meta.dir, "../src/index.ts"),
        prepared.artifact,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const error = await new Response(builder.stderr).text();
    expect(await builder.exited, error).toBe(0);
    const output = join(prepared.artifact, ".vercel/output");
    const source = await readFile(
      join(output, "functions/moonshine.func/index.mjs"),
      "utf8",
    );
    for (const host of [
      'from "react"',
      "react-dom",
      "solid-js",
      "moonshine-react",
      "registerRouteModules",
    ])
      expect(source).not.toContain(host);
    const config = await Bun.file(join(output, "config.json")).json();
    expect(config.routes).toEqual([
      { handle: "filesystem" },
      { src: "/.*", dest: "/moonshine" },
    ]);
    expect(
      await Bun.file(
        join(output, "functions/moonshine.func/.vc-config.json"),
      ).json(),
    ).toEqual({
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      supportsResponseStreaming: true,
    });
    expect(await Bun.file(join(output, "static/dist/server.js")).exists()).toBe(
      false,
    );
    const standalone = join(prepared.directory, "standalone");
    await mkdir(standalone);
    await cp(output, standalone, { recursive: true });
    const runner = Bun.spawn(
      [
        Bun.which("node")!,
        "--input-type=module",
        "-e",
        `
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[1];
const {default:handler}=await import(pathToFileURL(root+'/functions/moonshine.func/index.mjs'));
// Emulate only Build Output filesystem routing; the actual function is unchanged.
const server=createServer(async(req,res)=>{
 const path=resolve(root+'/static','.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if((req.method==='GET'||req.method==='HEAD')&&path.startsWith(root+'/static/')){
  try {const body=await readFile(path);res.writeHead(200,{'content-type':path.endsWith('.js')?'application/javascript':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.css')?'text/css':'text/plain'});res.end(req.method==='HEAD'?undefined:body);return;}catch{}
 }
 return handler(req,res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const base='http://127.0.0.1:'+server.address().port;
 const logo=await fetch(base+'/logo.svg');assert.equal(logo.status,200);assert.ok(logo.headers.get('content-type').includes('image/svg+xml'));assert.ok((await logo.text()).includes('<circle'));
 for(const [path,text]of [['/files/a%20b%25.txt','public percent and space'],['/files/literal%2520.txt','literal percent escape']]){const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(await response.text(),text);const head=await fetch(base+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');}
 const home=await fetch(base+'/?name=Vercel');assert.equal(home.status,200);
 const html=await home.text();assert.ok(html.includes('<title>hello, Vercel</title>'));assert.ok(html.includes('hello, Vercel'));assert.equal(home.headers.get('x-native-layout'),'yes');
 const post=await fetch(base+'/',{method:'POST',body:new URLSearchParams({name:'Node'}),redirect:'manual'});assert.equal(post.status,303);assert.equal(post.headers.get('location'),'/?name=Node');
 const shell=await fetch(base+'/counter');assert.equal(shell.status,200);const spa=await shell.text();assert.ok(spa.includes('<title>counter</title>'));
 const script=/<script type="module" src="([^"]+)"/.exec(spa)[1];
 const client=await fetch(base+script);assert.equal(client.status,200);assert.match(client.headers.get('content-type'),/javascript/);assert.ok(!(await client.text()).includes('NATIVE_SERVER_ONLY_MARKER'));
 for(const path of ['/',script]){const head=await fetch(base+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');}
 for(const path of ['/dist/server.js','/manifest.json','/functions/moonshine.func/index.mjs'])assert.equal((await fetch(base+path)).status,404);
 console.log('Node Vercel artifact acceptance passed');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
`,
        standalone,
      ],
      { cwd: standalone, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(runner.stdout).text(),
      new Response(runner.stderr).text(),
      runner.exited,
    ]);
    expect(code, stdout + stderr).toBe(0);
    expect(stdout).toContain("Node Vercel artifact acceptance passed");
  } finally {
    await prepared.cleanup();
  }
}, 60000);

test("native Vercel rejects unsupported Edge, context, islands and cache", async () => {
  const base = {
    version: 1 as const,
    frameworkVersion: "0.4.2",
    renderer: "native" as const,
    routes: [
      {
        id: "home",
        path: "/",
        file: "home.ts",
        runtime: "node" as const,
        mode: "ssr" as const,
        decision: "test",
        clientEntries: [],
      },
    ],
    assets: [],
    entries: {},
    capabilities: [],
  };
  for (const [manifest, message] of [
    [
      { ...base, routes: [{ ...base.routes[0]!, runtime: "vercel-edge" }] },
      "Node runtime",
    ],
    [{ ...base, requestContext: true }, "request context"],
    [
      { ...base, routes: [{ ...base.routes[0]!, mode: "island" }] },
      "hydration",
    ],
    [{ ...base, routes: [{ ...base.routes[0]!, cache: {} }] }, "caching"],
    [{ ...base, capabilities: ["revalidation"] }, "revalidation"],
  ] as const)
    await expect(
      vercelAdapter.build(manifest as never, "/unused"),
    ).rejects.toThrow(message);
});
