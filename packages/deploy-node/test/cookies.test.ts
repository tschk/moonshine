import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cookies = [
  "session=one; Path=/; HttpOnly",
  "preference=two; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/",
];

test("Node bridge preserves separate cookies and HEAD headers over HTTP in Bun and Node", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-node-cookies-"));
  try {
    const fixture = join(dir, "fixture.ts");
    await Bun.write(
      fixture,
      `
      import { createNodeHandler } from ${JSON.stringify(resolve(import.meta.dir, "../src/index.ts"))};
      import { createServer, request } from 'node:http';
      const cookies = ${JSON.stringify(cookies)};
      const server = createServer(createNodeHandler({fetch:async()=>{
        const headers=new Headers({'x-kept':'yes','transfer-encoding':'invalid-framing'});
        for(const value of cookies)headers.append('set-cookie',value);
        return new Response('payload',{headers});
      }}));
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      try {
        const results=[];
        for(const method of ['GET','HEAD'])results.push(await new Promise((resolve,reject)=>{
          const req=request({hostname:'127.0.0.1',port:server.address().port,path:'/',method},res=>{
            let body='';res.setEncoding('utf8');res.on('data',part=>body+=part);
            res.on('end',()=>resolve({method,body,cookies:res.headers['set-cookie'],kept:res.headers['x-kept'],framing:res.headers['transfer-encoding'],rawHeaders:res.rawHeaders}));
          });req.on('error',reject);req.end();
        }));
        console.log(JSON.stringify(results));
      } finally { await new Promise(resolve=>server.close(resolve)); }
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
      const results = JSON.parse(stdout) as Array<{
        method: string;
        body: string;
        cookies: string[];
        kept: string;
        framing?: string;
        rawHeaders: string[];
      }>;
      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.cookies).toEqual(cookies);
        expect(
          result.rawHeaders.filter(
            (value) => value.toLowerCase() === "set-cookie",
          ),
        ).toHaveLength(2);
        expect(result.kept).toBe("yes");
        expect(result.framing).not.toBe("invalid-framing");
        expect(result.body).toBe(result.method === "HEAD" ? "" : "payload");
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
