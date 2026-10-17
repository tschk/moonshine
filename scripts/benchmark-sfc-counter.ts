import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { availableParallelism, cpus, loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { compileCommand } from "../packages/cli/src/compile";

// Exact authored SFCs with external browser instrumentation; app bundles stay unchanged.
const root = resolve(import.meta.dir, "..");
const requested = Bun.which(process.env.CREPUS_COMPILER ?? "crepus");
assert.ok(requested, "Install Crepus or set CREPUS_COMPILER");
const directory = await mkdtemp(join(tmpdir(), "moonshine-sfc-counter-"));
const hash = (source: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(source).digest("hex");
let server: ReturnType<typeof Bun.serve> | undefined;
try {
  const compiler = join(directory, "crepus");
  await cp(requested, compiler);
  const compilerSha256 = hash(await readFile(compiler));
  const version = Bun.spawn([compiler, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [compilerVersion, versionError, versionCode] = await Promise.all([
    new Response(version.stdout).text(),
    new Response(version.stderr).text(),
    version.exited,
  ]);
  assert.equal(versionCode, 0, versionError);
  const runtimeSha256: Record<string, string> = {};
  const inputSha256: Record<string, Record<string, string>> = {};
  const recordedFiles = new Map<string, string>();
  const serverEnvironment =
    "export const DEV=false;export const BROWSER=false;export const BUILD=false;";
  for (const [name, source] of [
    ["moonshine", "core"],
    ["moonshine-dom", "dom"],
    ["moonshine-svelte", "adapter-svelte"],
  ] as const) {
    const target = join(directory, "node_modules/@tschk", name);
    await cp(join(root, "packages", source, "src"), join(target, "src"), {
      recursive: true,
    });
    await cp(
      join(root, "packages", source, "package.json"),
      join(target, "package.json"),
    );
    const files = await Array.fromAsync(
      new Bun.Glob("**/*").scan({ cwd: target, onlyFiles: true }),
    );
    const digest = new Bun.CryptoHasher("sha256");
    for (const file of files.toSorted()) {
      digest.update(file + "\0");
      digest.update(await readFile(join(target, file)));
      digest.update("\0");
    }
    runtimeSha256[name] = digest.digest("hex");
  }
  const sources: Record<string, string> = {};
  for (const name of ["counter", "counter-label"]) {
    sources[name] = await Bun.file(
      join(root, "examples/native-template/templates/runes", name + ".svelte"),
    ).text();
    await writeFile(join(directory, name + ".svelte"), sources[name]!);
  }
  await compileCommand([
    join(directory, "counter.svelte"),
    "--compiler",
    compiler,
  ]);
  const reference = dirname(
    Bun.resolveSync("svelte/package.json", join(root, "examples/svelte-adopt")),
  );
  const { compile } = await import(join(reference, "compiler/index.js"));
  for (const [name, source] of Object.entries(sources)) {
    const output = compile(source, {
      generate: "client",
      dev: false,
      filename: name + ".svelte",
    });
    await writeFile(join(directory, name + ".official.js"), output.js.code);
  }
  const entries = {
    moonshine: `import Counter from './counter.dom.ts';import{h,render}from'@tschk/moonshine-dom/dom';render(()=>h(Counter,{}),document.querySelector('#app'));`,
    svelte: `import Counter from './counter.official.js';import{mount}from'svelte';mount(Counter,{target:document.querySelector('#app')});`,
  };
  const assets = new Map<string, Uint8Array<ArrayBuffer>>();
  const sizes: Record<
    string,
    { rawBytes: number; gzipBytes: number; brotliBytes: number; sha256: string }
  > = {};
  for (const [name, source] of Object.entries(entries)) {
    const entry = join(directory, name + ".ts");
    await writeFile(entry, source);
    const built = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      minify: true,
      metafile: true,
      conditions: ["browser", "production"],
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "installed-reference",
          setup(build) {
            build.onResolve({ filter: /\.svelte$/ }, (args) => ({
              path: resolve(
                dirname(args.importer),
                args.path.slice(0, -7) + ".official.js",
              ),
            }));
            build.onResolve({ filter: /^svelte(?:\/|$)/ }, (args) => ({
              path:
                args.path === "svelte"
                  ? join(reference, "src/index-client.js")
                  : Bun.resolveSync(args.path, reference),
            }));
          },
        },
      ],
    });
    assert.ok(built.success, built.logs.join("\n"));
    assert.ok(built.metafile, "Missing browser bundle input metadata");
    const inputs: Record<string, string> = {};
    for (const file of Object.keys(built.metafile.inputs).toSorted()) {
      const path = resolve(file);
      const digest = hash(await readFile(path));
      const previous = recordedFiles.get(path);
      assert.ok(
        previous === undefined || previous === digest,
        `Input changed: ${path}`,
      );
      recordedFiles.set(path, digest);
      inputs[path] = digest;
    }
    inputSha256[`browser:${name}`] = inputs;
    assert.equal(built.outputs.length, 1);
    const bytes = new Uint8Array(await built.outputs[0]!.arrayBuffer());
    sizes[name] = {
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
      brotliBytes: brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
      sha256: hash(bytes),
    };
    assets.set("/" + name + ".js", bytes);
  }
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (assets.has(path))
        return new Response(assets.get(path), {
          headers: {
            "content-type": "application/javascript",
            "cache-control": "no-store",
          },
        });
      if (path === "/moonshine" || path === "/svelte")
        return new Response(
          `<div id="app"></div><script>const started=performance.now();window.startup=new Promise(resolve=>{const observer=new MutationObserver(()=>{if(document.querySelector('button span')?.textContent==='0/0'){observer.disconnect();resolve(performance.now()-started)}});observer.observe(document.querySelector('#app'),{childList:true,subtree:true,characterData:true})});</script><script type="module" src="` +
            path +
            '.js"></script>',
          {
            headers: {
              "content-type": "text/html",
              "cache-control": "no-store",
            },
          },
        );
      return new Response("Missing", { status: 404 });
    },
  });
  const host = {
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus()[0]?.model,
    logicalCPUs: availableParallelism(),
    loadAverageBefore: loadavg(),
  };
  const child = Bun.spawn(
    [
      "python3",
      "-c",
      `import sys,json,math,statistics
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch()
 for name in ['moonshine','svelte']:
  page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(sys.argv[1]+name,wait_until='networkidle')
  label=page.locator('button span');expect(label).to_have_text('0/0');first=label.element_handle()
  for value in range(1,6):
   page.locator('button').click();expect(label).to_have_text(str(value)+'/'+str(value*2))
  assert label.evaluate('(node,first)=>node===first',first)
  assert not errors,errors
  page.close()
 samples={name:{'startupMs':[],'clickCommitMs':[]} for name in ['moonshine','svelte']}
 documents={name:[] for name in samples}
 for iteration in range(30):
  order=['moonshine','svelte'] if iteration%2==0 else ['svelte','moonshine']
  for name in order:
   page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(sys.argv[1]+name,wait_until='load')
   startup=page.evaluate('startup')
   clicks=page.evaluate("""async()=>{const label=document.querySelector('button span'),button=document.querySelector('button'),first=label;const times=[];for(let value=1;value<=25;value++){const expected=value+'/'+value*2;const started=performance.now();await new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{if(label.textContent===expected){observer.disconnect();clearTimeout(timer);resolve()}});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Commit timeout '+expected))},5000);observer.observe(label,{childList:true,subtree:true,characterData:true});button.click()});times.push(performance.now()-started);if(document.querySelector('button span')!==first)throw new Error('Child identity changed')}return times}""")
   resolution=page.evaluate("""()=>{let previous=performance.now(),minimum=Infinity;for(let i=0;i<10000;i++){const now=performance.now(),delta=now-previous;if(delta>0)minimum=Math.min(minimum,delta);previous=now;}return Number.isFinite(minimum)?minimum:null;}""")
   assert not errors,errors
   if iteration>=5:
    samples[name]['startupMs'].append(startup);samples[name]['clickCommitMs'].extend(clicks)
    documents[name].append({'iteration':iteration-5,'startupMs':startup,'clickCommitMs':clicks,'clickClusterMs':math.fsum(clicks),'clockResolutionMs':resolution})
   page.close()
 def summary(values):
  ordered=sorted(values)
  return {'samples':len(values),'median':statistics.median(values),'p95':ordered[math.ceil(.95*len(values))-1]}
 print('TIMINGS_JSON='+json.dumps({name:{metric:summary(values) for metric,values in metrics.items()} for name,metrics in samples.items()}))
 print('BROWSER_SAMPLES_JSON='+json.dumps({'chromiumVersion':browser.version,'documents':documents,'clickClusterMs':{name:summary([record['clickClusterMs'] for record in records]) for name,records in documents.items()}}))
 browser.close()
print('Same authored SFC counter output, five serial clicks and retained child identity passed')`,
      server.url.href,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(code, 0, output + error);
  console.log(output.trim());
  const timingLine = output
    .split("\n")
    .find((line) => line.startsWith("TIMINGS_JSON="));
  assert.ok(timingLine, "Missing browser measurements");
  const browserSamplesLine = output
    .split("\n")
    .find((line) => line.startsWith("BROWSER_SAMPLES_JSON="));
  assert.ok(browserSamplesLine, "Missing raw browser measurements");
  const ssr = await measureSSR();
  const result = {
    host: { ...host, loadAverageAfter: loadavg() },
    ssr,
    timings: JSON.parse(timingLine.slice("TIMINGS_JSON=".length)),
    browserMeasurements: JSON.parse(
      browserSamplesLine.slice("BROWSER_SAMPLES_JSON=".length),
    ),
    timingMethod: {
      warmupsPerFramework: 5,
      samplesPerFramework: 25,
      clicksPerSample: 25,
      order: "alternating",
      startup:
        "fresh document HTML pre-module clock to observed 0/0 DOM commit; localhost module fetch/evaluation/commit; warm browser; no-store",
      click:
        "in-page performance.now; MutationObserver installed before button.click(); serial expected DOM commits",
      clickCluster:
        "sum of the same 25 click-to-commit observations per document; excludes gaps between clicks, not an independent wall-clock batch",
      clockResolution:
        "minimum positive performance.now delta observed in 10,000 reads after the document's timed clicks; null when no positive tick is observed",
      excludes:
        "RPC time, navigation, paint, cold browser, remote network, SSR, hydration",
    },
    scope:
      "same authored two-component SFC counter; unchanged production bundles; scoped localhost startup and serial click-to-DOM-commit timings; five functional clicks and retained child identity",
    bun: Bun.version,
    svelte: (await Bun.file(join(reference, "package.json")).json()).version,
    moonshine: (
      await Bun.file(
        join(directory, "node_modules/@tschk/moonshine-dom/package.json"),
      ).json()
    ).version,
    compilerVersion: compilerVersion.trim(),
    compilerSha256,
    date: new Date().toISOString(),
    runtimeSha256,
    inputSha256,
    sourceSha256: Object.fromEntries(
      Object.entries(sources).map(([name, source]) => [name, hash(source)]),
    ),
    compression: { gzipLevel: 9, brotliQuality: 11 },
    sizes,
  };
  async function measureSSR() {
    await compileCommand([
      join(directory, "counter.svelte"),
      "--ssr",
      "--compiler",
      compiler,
    ]);
    for (const [name, source] of Object.entries(sources)) {
      const serverOutput = compile(source, {
        generate: "server",
        dev: false,
        filename: name + ".svelte",
      });
      await writeFile(
        join(directory, name + ".official.ssr.js"),
        serverOutput.js.code,
      );
    }
    const fixtures = [];
    for (const [name, source] of Object.entries({
      moonshine: `import Counter from './counter.ssr.ts';import{h,renderToString}from'@tschk/moonshine-dom/ssr';export const render=()=>renderToString(()=>h(Counter,{}));`,
      svelte: `import Counter from './counter.official.ssr.js';import{render as ssr}from'svelte/server';export const render=()=>ssr(Counter).body;`,
    })) {
      const entry = join(directory, name + ".ssr.entry.ts");
      await writeFile(entry, source);
      const built = await Bun.build({
        entrypoints: [entry],
        target: "bun",
        minify: true,
        metafile: true,
        conditions: ["production"],
        define: { "process.env.NODE_ENV": '"production"' },
        plugins: [
          {
            name: "installed-server-reference",
            setup(build) {
              build.onResolve({ filter: /\.svelte$/ }, (args) => ({
                path: resolve(
                  dirname(args.importer),
                  args.path.slice(0, -7) + ".official.ssr.js",
                ),
              }));
              build.onResolve({ filter: /^svelte(?:\/|$)/ }, (args) => ({
                path:
                  args.path === "svelte"
                    ? join(reference, "src/index-server.js")
                    : Bun.resolveSync(args.path, reference),
              }));
              build.onResolve({ filter: /^esm-env$/ }, () => ({
                path: "server",
                namespace: "pinned-env",
              }));
              build.onLoad({ filter: /.*/, namespace: "pinned-env" }, () => ({
                contents: serverEnvironment,
                loader: "js",
              }));
            },
          },
        ],
      });
      assert.ok(built.success, built.logs.join("\n"));
      assert.ok(built.metafile, "Missing SSR bundle input metadata");
      const inputs: Record<string, string> = {};
      for (const file of Object.keys(built.metafile.inputs).toSorted()) {
        if (file === "pinned-env:server") {
          inputs[file] = hash(serverEnvironment);
          continue;
        }
        const path = resolve(file);
        const digest = hash(await readFile(path));
        const previous = recordedFiles.get(path);
        assert.ok(
          previous === undefined || previous === digest,
          `Input changed: ${path}`,
        );
        recordedFiles.set(path, digest);
        inputs[path] = digest;
      }
      inputSha256[`ssr:${name}`] = inputs;
      assert.equal(built.outputs.length, 1);
      const bytes = new Uint8Array(await built.outputs[0]!.arrayBuffer());
      const serverBundle = join(directory, name + ".ssr.built.js");
      await writeFile(serverBundle, bytes);
      fixtures.push({
        name,
        output: serverBundle,
        size: {
          rawBytes: bytes.length,
          gzipBytes: gzipSync(bytes, { level: 9 }).length,
          brotliBytes: brotliCompressSync(bytes, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }).length,
          sha256: hash(bytes),
        },
      });
    }
    const driver = join(directory, "measure-ssr.ts");
    // Load completed bundles in a fresh process, independent of Bun.build's resolver cache.
    await writeFile(
      driver,
      `import assert from 'node:assert/strict';
const fixtures=JSON.parse(process.argv[2]);
for(const fixture of fixtures){fixture.render=(await import(fixture.output)).render;fixture.html=fixture.render();fixture.samples=[];assert.equal(fixture.render(),fixture.html);assert.equal(fixture.html.replace(/<!--[\\s\\S]*?-->/g,''),'<button type="button"><span>0/0</span></button>');}
for(let sample=0;sample<30;sample++)for(const fixture of sample%2?fixtures.toReversed():fixtures){let length=0;const started=performance.now();for(let i=0;i<5000;i++)length+=fixture.render().length;const elapsed=performance.now()-started;assert.equal(length,fixture.html.length*5000);assert.equal(fixture.render(),fixture.html);if(sample>=5)fixture.samples.push(elapsed/5000);}
console.log(JSON.stringify(Object.fromEntries(fixtures.map(({name,html,samples,size})=>{const sorted=samples.toSorted((a,b)=>a-b);return[name,{html,size,samples,medianMs:sorted[12],p95Ms:sorted[23]}]}))));`,
    );
    const measurement = Bun.spawn(
      [process.execPath, driver, JSON.stringify(fixtures)],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [ssrOutput, ssrError, ssrCode] = await Promise.all([
      new Response(measurement.stdout).text(),
      new Response(measurement.stderr).text(),
      measurement.exited,
    ]);
    assert.equal(ssrCode, 0, ssrOutput + ssrError);
    return {
      scope:
        "same authored two-component counter; fresh synchronous SSR requests in a warm Bun process; no hydration, routing, async data, network or cold startup",
      timingMethod: {
        iterationsPerSample: 5000,
        warmupsPerFramework: 5,
        samplesPerFramework: 25,
        order: "alternating",
        unit: "ms/render",
      },
      visibleHTML: '<button type="button"><span>0/0</span></button>',
      fixtures: JSON.parse(ssrOutput),
    };
  }

  for (const [path, digest] of recordedFiles) {
    assert.equal(hash(await readFile(path)), digest, `Input changed: ${path}`);
  }
  assert.equal(
    hash(await readFile(compiler)),
    compilerSha256,
    "Compiler changed",
  );
  const destination =
    process.env.BENCHMARK_RESULT ??
    join(tmpdir(), "moonshine-sfc-counter.json");
  await Bun.write(destination, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.log("Result: " + destination);
} finally {
  server?.stop(true);
  await rm(directory, { recursive: true, force: true });
}
