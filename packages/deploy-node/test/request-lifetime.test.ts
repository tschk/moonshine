import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Node request completion stays live while actual disconnects abort", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-node-request-lifetime-"));
  try {
    const fixture = join(dir, "fixture.ts");
    await Bun.write(
      fixture,
      `
import {createNodeHandler} from ${JSON.stringify(resolve(import.meta.dir, "../src/index.ts"))};
import {createServer,request as send} from 'node:http';
const results={};let ready,aborted;
function deadline(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Abort signal timeout')),1500))]).finally(()=>clearTimeout(timer))}
const server=createServer(createNodeHandler({fetch:async request=>{
 const path=new URL(request.url).pathname;
 if(path==='/complete'){await request.text();await new Promise(done=>setImmediate(done));return Response.json({aborted:request.signal.aborted})}
 const seen=new Promise(resolve=>request.signal.addEventListener('abort',()=>resolve(true),{once:true}));
 if(path==='/disconnect')await request.text();
 ready.resolve();
 await deadline(seen);results[path]=request.signal.aborted;aborted.resolve();
 return new Response(null);
}}));
await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;
try{
 results.complete=await new Promise((resolve,reject)=>{const req=send({hostname:'127.0.0.1',port,path:'/complete',method:'POST'},res=>{let text='';res.setEncoding('utf8');res.on('data',part=>text+=part);res.on('end',()=>resolve(JSON.parse(text)))});req.on('error',reject);req.end('complete body')});
 for(const path of ['/disconnect','/partial']){ready=Promise.withResolvers();aborted=Promise.withResolvers();const req=send({hostname:'127.0.0.1',port,path,method:'POST',headers:{'content-length':path==='/partial'?'100':'4'}});req.on('error',()=>{});if(path==='/partial')req.write('part');else req.end('body');await deadline(ready.promise);req.destroy();await deadline(aborted.promise);}
 console.log(JSON.stringify(results));
}finally{await new Promise(done=>server.close(done))}
`,
    );
    const built = await Bun.build({ entrypoints: [fixture], target: "node" });
    expect(built.success, built.logs.join("\n")).toBe(true);
    const file = join(dir, "fixture.mjs");
    await Bun.write(file, built.outputs[0]!);
    for (const runtime of [process.execPath, Bun.which("node")!]) {
      const child = Bun.spawn([runtime, file], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exit, stderr).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.complete.aborted, runtime).toBe(false);
      expect(result["/disconnect"], runtime).toBe(true);
      expect(result["/partial"], runtime).toBe(true);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
