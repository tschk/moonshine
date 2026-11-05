import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { buildProjectIsolated } from "../../compiler/test/build-in-subprocess";

test("React worker runs a relocated compiler artifact", async () => {
  const project = join(import.meta.dir, `.tmp-react-${process.pid}`);
  const standalone = await mkdtemp(join(tmpdir(), "moonshine-cf-react-"));
  try {
    await mkdir(join(project, "src/routes/hello"), { recursive: true });
    await mkdir(join(project, "public"), { recursive: true });
    await writeFile(join(project, "public/logo.txt"), "public asset");
    await writeFile(
      join(project, "src/routes/+layout.tsx"),
      `import { useId } from "react";
export default function Layout({children}) { return <main id={useId()}>{children}</main>; }`,
    );
    await writeFile(
      join(project, "src/routes/hello/[name].tsx"),
      `export function loader({params, request}) { return {name: params.name, user: request.headers.get('x-user') ?? 'guest'}; }
export default function Page({data}) { const value = Object.values(data)[0]; return <h1>hello {value.name} {value.user}</h1>; }`,
    );
    await buildProjectIsolated({ projectDir: project, runtime: "cloudflare" });
    const out = join(project, ".moonshine");
    const builder = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
const { cloudflareAdapter } = await import(process.argv[1]);
const out = process.argv[2];
const manifest = await Bun.file(out + '/manifest.json').json();
manifest.routes[0].cache = {control:'public, max-age=60'};
await cloudflareAdapter.build(manifest, out);
`,
        resolve(import.meta.dir, "../src/index.ts"),
        out,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const error = await new Response(builder.stderr).text();
    expect(await builder.exited, error).toBe(0);
    const config = await Bun.file(join(out, "wrangler.jsonc")).json();
    expect(config.main).toBe("server.js");
    expect(config.assets.run_worker_first).toBe(true);
    for (const file of ["server.js", "public", "wrangler.jsonc"])
      await cp(join(out, file), join(standalone, file), { recursive: true });
    const runner = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
import assert from 'node:assert/strict';
const {default: worker} = await import(process.argv[1] + '/server.js');
const env = {ASSETS: {fetch: async request => {
 const path = new URL(request.url).pathname;
 if (path === '/logo.txt') return new Response(await Bun.file(process.argv[1] + '/public/logo.txt').text());
 return new Response('missing', {status:404});
}}};
let reads = 0, writes = 0;
globalThis.caches = {default: {
 async match() { reads++; return new Response('stale private data'); },
 async put() { writes++; },
}};
const pending = [];
const ctx = {waitUntil(promise) { pending.push(promise); }};
const logo = await worker.fetch(new Request('https://example.com/logo.txt'), env, ctx);
assert.equal(await logo.text(), 'public asset');
const response = await worker.fetch(new Request('https://example.com/hello/Cloudflare'), env, ctx);
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'private, no-store');
assert.match(await response.text(), /hello <!-- -->Cloudflare<!-- --> <!-- -->guest/);
await Promise.all(pending);
assert.equal(reads, 0);
assert.equal(writes, 0);
const privateResponse = await worker.fetch(new Request('https://example.com/hello/Cloudflare', {headers:{'x-user':'alice'}}), env, ctx);
assert.equal(privateResponse.headers.get('cache-control'), 'private, no-store');
assert.match(await privateResponse.text(), /alice/);
const otherResponse = await worker.fetch(new Request('https://example.com/hello/Cloudflare', {headers:{'x-user':'bob'}}), env, ctx);
assert.equal(otherResponse.headers.get('cache-control'), 'private, no-store');
assert.match(await otherResponse.text(), /bob/);
assert.equal(reads, 0);
assert.equal(writes, 0);
assert.equal((await worker.fetch(new Request('https://example.com/missing'), env, ctx)).status, 404);
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
    const wrangler = Bun.which("wrangler");
    if (wrangler) {
      const miniflare = createRequire(realpathSync(wrangler)).resolve(
        "miniflare",
      );
      const runtime = Bun.spawn(
        [
          Bun.which("node")!,
          "--input-type=module",
          "-e",
          `
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {Miniflare, convertV4MiniflareOptions} = createRequire(import.meta.url)(process.argv[1]);
const root = process.argv[2];
const options = {modules:true, modulesRoot:root, scriptPath:root+'/server.js', compatibilityDate:'2026-06-16', compatibilityFlags:['nodejs_compat'], assets:{directory:root+'/public',binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}}};
const mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
try {
 const asset = await mf.dispatchFetch('http://localhost/logo.txt');
 assert.equal(await asset.text(), 'public asset');
 const page = await mf.dispatchFetch('http://localhost/hello/Cloudflare');
 assert.equal(page.status, 200);
 assert.equal(page.headers.get('cache-control'), 'private, no-store');
 assert.match(await page.text(), /hello <!-- -->Cloudflare/);
 const personalized = await mf.dispatchFetch('http://localhost/hello/Cloudflare', {headers:{'x-user':'alice'}});
 assert.equal(personalized.headers.get('cache-control'), 'private, no-store');
 assert.match(await personalized.text(), /alice/);
 assert.equal((await mf.dispatchFetch('http://localhost/dist/server.js')).status, 404);
} finally { await mf.dispose(); }
`,
          miniflare,
          standalone,
        ],
        { cwd: standalone, stdout: "pipe", stderr: "pipe" },
      );
      const [runtimeOut, err, status] = await Promise.all([
        new Response(runtime.stdout).text(),
        new Response(runtime.stderr).text(),
        runtime.exited,
      ]);
      expect(status, runtimeOut + err).toBe(0);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(standalone, { recursive: true, force: true });
  }
}, 120000);
