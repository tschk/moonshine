import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("completed uploads stay live; real Node disconnects and partial uploads abort", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-node-request-lifetime-"));
  try {
    const fixture = join(dir, "fixture.ts");
    await Bun.write(
      fixture,
      `
import {createNodeHandler} from ${JSON.stringify(resolve(import.meta.dir, "../src/index.ts"))};
import {createServer,request as send} from 'node:http';
const results={runtime:process.versions.bun?"bun":"node"};let ready,aborted;
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}}
function deadline(promise,label){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Abort signal timeout: '+label)),1500))]).finally(()=>clearTimeout(timer))}
const server=createServer(createNodeHandler({fetch:async request=>{
 const path=new URL(request.url).pathname;
 if(path==='/complete'){await request.text();await new Promise(done=>setImmediate(done));return Response.json({aborted:request.signal.aborted})}
 const seen=new Promise(resolve=>request.signal.addEventListener('abort',()=>resolve(true),{once:true}));
 if(path==='/disconnect')await request.text();else await request.body.getReader().read();
 ready.resolve();
 await deadline(seen,path);results[path]=request.signal.aborted;aborted.resolve();
 return new Response(null);
}}));
await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;
try{
 results.complete=await new Promise((resolve,reject)=>{const req=send({hostname:'127.0.0.1',port,path:'/complete',method:'POST',agent:false},res=>{let text='';res.setEncoding('utf8');res.on('data',part=>text+=part);res.on('end',()=>resolve(JSON.parse(text)))});req.on('error',reject);req.end('complete body')});
 // Bun 1.3.10 clears abort callbacks at body EOF; real Node covers full-upload disconnects.
 for(const path of (process.versions.bun?['/partial']:['/disconnect','/partial'])){ready=deferred();aborted=deferred();if(process.versions.bun){const controller=new AbortController();const body=path==='/partial'?new ReadableStream({start(stream){stream.enqueue(new TextEncoder().encode('part'))}}):'body';const pending=fetch('http://127.0.0.1:'+port+path,{method:'POST',body,duplex:'half',signal:controller.signal}).catch(()=>{});try{await deadline(ready.promise,path+' ready');controller.abort();await pending;await deadline(aborted.promise,path+' aborted');}finally{controller.abort()}}else{const req=send({hostname:'127.0.0.1',port,path,method:'POST',agent:false,headers:{'content-length':path==='/partial'?'100':'4'}});req.on('error',()=>{});try{if(path==='/partial')req.write('part');else req.end('body');await deadline(ready.promise,path+' ready');req.destroy();await deadline(aborted.promise,path+' aborted');}finally{req.destroy()}}}
 console.log(JSON.stringify(results));
}finally{await new Promise(done=>server.close(done))}
`,
    );
    const file = join(dir, "fixture.mjs");
    const build = Bun.spawn(
      [process.execPath, "build", fixture, "--target=node", "--outfile", file],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [buildOut, buildError, buildExit] = await Promise.all([
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
      build.exited,
    ]);
    expect(buildExit, buildOut + buildError).toBe(0);
    for (const runtime of [process.execPath, Bun.which("node")!]) {
      const child = Bun.spawn([runtime, file], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const timer = setTimeout(() => child.kill(), 3500);
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      clearTimeout(timer);
      expect(exit, stdout + stderr).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.complete.aborted, runtime).toBe(false);
      if (runtime !== process.execPath) {
        expect(result.runtime).toBe("node");
        expect(result["/disconnect"], runtime).toBe(true);
      }
      expect(result["/partial"], runtime).toBe(true);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
