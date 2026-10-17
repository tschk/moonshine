import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { cp, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prepareNativeArtifact } from "../../deploy-bun/test/native-fixture";

function installedEmulator(): string | undefined {
  try {
    const wrangler = Bun.which("wrangler");
    return wrangler
      ? createRequire(realpathSync(wrangler)).resolve("miniflare")
      : undefined;
  } catch {
    return undefined;
  }
}
const emulator = installedEmulator();

test.skipIf(!emulator)(
  "native Cloudflare artifact runs relocated SSR and SPA assets in workerd",
  async () => {
    const prepared = await prepareNativeArtifact();
    try {
      const builder = Bun.spawn(
        [
          process.execPath,
          "-e",
          `
const {cloudflareAdapter}=await import(process.argv[1]);
const out=process.argv[2];
const manifest=await Bun.file(out+'/manifest.json').json();
for(const route of manifest.routes)route.runtime='cloudflare';
await cloudflareAdapter.build(manifest,out);
`,
          resolve(import.meta.dir, "../src/index.ts"),
          prepared.artifact,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const error = await new Response(builder.stderr).text();
      expect(await builder.exited, error).toBe(0);
      const source = await readFile(
        join(prepared.artifact, "server.js"),
        "utf8",
      );
      expect(source).not.toContain('from "react"');
      expect(source).not.toContain("solid-js");
      expect(source).not.toContain("moonshine-react");
      expect(source).not.toContain("react-dom");
      expect(source).not.toContain("registerRouteModules");
      const standalone = join(prepared.directory, "worker");
      await mkdir(standalone);
      for (const file of ["server.js", "wrangler.jsonc", "public"])
        await cp(join(prepared.artifact, file), join(standalone, file), {
          recursive: true,
        });
      const runner = Bun.spawn(
        [
          Bun.which("node")!,
          "--input-type=module",
          "-e",
          `
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {Miniflare}=createRequire(import.meta.url)(process.argv[1]);
const root=process.argv[2];
const mf=new Miniflare({modules:true,modulesRoot:root,scriptPath:root+'/server.js',compatibilityDate:'2026-06-16',compatibilityFlags:['nodejs_compat'],assets:{directory:root+'/public',binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}}});
try{
 const logo=await mf.dispatchFetch('http://localhost/logo.svg');assert.equal(logo.status,200);assert.ok(logo.headers.get('content-type').includes('image/svg'));assert.ok((await logo.text()).includes('<circle'));
 for(const [path,text]of [['/files/a%20b%25.txt','public percent and space'],['/files/literal%2520.txt','literal percent escape']]){const response=await mf.dispatchFetch('http://localhost'+path);assert.equal(response.status,200);assert.equal(await response.text(),text);const head=await mf.dispatchFetch('http://localhost'+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');}
 const home=await mf.dispatchFetch('http://localhost/?name=Edge');
 assert.equal(home.status,200);const homeHtml=await home.text();assert.ok(homeHtml.includes("<title>hello, Edge</title>"));
 const shell=await mf.dispatchFetch('http://localhost/counter');
 assert.equal(shell.status,200);const html=await shell.text();assert.ok(html.includes("<title>counter</title>"));assert.match(html,/data-moonshine-app="counter"/);
 const script=/<script type="module" src="([^"]+)"/.exec(html)[1];
 const asset=await mf.dispatchFetch('http://localhost'+script);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);
 const head=await mf.dispatchFetch('http://localhost'+script,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 const homeHead=await mf.dispatchFetch('http://localhost/',{method:'HEAD'});assert.equal(homeHead.status,200);assert.equal(await homeHead.text(),'');
 assert.equal((await mf.dispatchFetch('http://localhost/dist/server.js')).status,404);
 console.log('workerd native acceptance passed');
}finally{await mf.dispose();}
`,
          emulator!,
          standalone,
        ],
        { cwd: standalone, stdout: "pipe", stderr: "pipe" },
      );
      const [out, err, code] = await Promise.all([
        new Response(runner.stdout).text(),
        new Response(runner.stderr).text(),
        runner.exited,
      ]);
      expect(code, out + err).toBe(0);
      expect(out).toContain("workerd native acceptance passed");
    } finally {
      await prepared.cleanup();
    }
  },
  60000,
);

test("native Cloudflare rejects unsupported request context, hydration and caching", async () => {
  const { cloudflareAdapter } = await import("../src/index");
  const base = {
    version: 1 as const,
    frameworkVersion: "0.4.2",
    renderer: "native" as const,
    routes: [
      {
        id: "home",
        path: "/",
        file: "home.ts",
        mode: "ssr" as const,
        runtime: "cloudflare" as const,
        decision: "fixture",
        clientEntries: [],
      },
    ],
    assets: [],
    entries: {},
    capabilities: [],
  };
  for (const [manifest, message] of [
    [{ ...base, requestContext: true }, "request context"],
    [
      { ...base, routes: [{ ...base.routes[0]!, mode: "island" as const }] },
      "hydration",
    ],
    [
      {
        ...base,
        routes: [{ ...base.routes[0]!, cache: { control: "max-age=60" } }],
      },
      "caching/revalidation",
    ],
    [
      { ...base, capabilities: ["revalidation" as const] },
      "caching/revalidation",
    ],
  ] as const)
    await expect(
      cloudflareAdapter.build(
        manifest as Parameters<typeof cloudflareAdapter.build>[0],
        "unused-native-edge",
      ),
    ).rejects.toThrow(message);
});
