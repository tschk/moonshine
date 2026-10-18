/** Optional development benchmark. Requires a local Crepus CLI and installed Svelte reference. */
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
assert.ok(
  args[0] === "--compiler" &&
    (args.length === 2 || (args.length === 4 && args[2] === "--svelte")),
  "Usage: bun scripts/benchmark-svelte-form-ssr.ts --compiler <crepus> [--svelte <installed-package-directory>]",
);
const compiler = resolve(args[1]!);
const root = resolve(import.meta.dir, "..");
const hostRoot = args[3]
  ? resolve(args[3])
  : dirname(Bun.resolveSync("svelte/package.json", root));
const hostPackage = join(hostRoot, "package.json");
const median = (values: number[]) => values.toSorted((a, b) => a - b)[3]!;
const directory = await mkdtemp(join(tmpdir(), "moonshine-form-benchmark-"));
const source = `<script>
let fields=$state({input:{defaultValue:'seed',value:'live'},textarea:{defaultValue:'text seed',value:'text live'},select:{defaultValue:'a',value:'b'}});
export function update(next){fields=next;}
</script><form><input {...fields.input}><textarea {...fields.textarea}></textarea><select {...fields.select}><option value="a">A</option><option value="b">B</option><option value="c">C</option></select></form>`;
type Sample = {
  firstRenderMs: number;
  repeatedMs: number;
  chars: number;
  processMs: number;
};
const rows: Array<{
  implementation: string;
  raw: number;
  gzip: number;
  path: string;
  samples: Sample[];
}> = [];
try {
  await mkdir(join(directory, "source"));
  await writeFile(join(directory, "source/Page.svelte"), source);
  await mkdir(join(directory, "node_modules/@tschk"), { recursive: true });
  await symlink(hostRoot, join(directory, "node_modules/svelte"));
  const { compile } = await import(
    Bun.resolveSync("svelte/compiler", directory)
  );
  for (const [name, folder] of [
    ["moonshine", "core"],
    ["moonshine-dom", "dom"],
    ["moonshine-svelte", "adapter-svelte"],
    ["moonshine-framework", "framework"],
  ])
    await symlink(
      join(root, "packages", folder!),
      join(directory, "node_modules/@tschk", name!),
    );
  const child = Bun.spawn(
    [
      compiler,
      "web",
      "build",
      "--site",
      join(directory, "source"),
      "--entry",
      "Page.svelte",
      "--emit",
      "moonshine-ssr",
      "--out-dir",
      join(directory, "native"),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(code, 0, out + err);
  await writeFile(
    join(directory, "host.js"),
    compile(source, { filename: "Page.svelte", generate: "server", dev: false })
      .js.code,
  );
  for (const implementation of ["svelte", "moonshine"]) {
    const imports =
      implementation === "svelte"
        ? `import Page from './host.js';import{render as hostRender}from'svelte/server';const render=()=>hostRender(Page).body;`
        : `import Page from './native/CrepusEmit.moonshine-ssr.ts';import{renderToString}from'@tschk/moonshine-dom/ssr';const render=()=>renderToString(()=>Page({}));`;
    const entry = join(directory, implementation + ".ts");
    await writeFile(
      entry,
      imports +
        `const firstStart=performance.now();const html=render();const firstRenderMs=performance.now()-firstStart;if(!html.includes('value="live"')||!html.includes('value="b" selected=""'))throw Error('Incorrect form output');for(let i=0;i<1000;i++)render();const start=performance.now();let chars=0;for(let i=0;i<5000;i++)chars+=render().length;console.log(JSON.stringify({firstRenderMs,repeatedMs:performance.now()-start,chars}));`,
    );
    const build = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      minify: true,
    });
    assert.ok(build.success, String(build.logs));
    const data = new Uint8Array(await build.outputs[0]!.arrayBuffer());
    const path = join(directory, implementation + ".js");
    await writeFile(path, data);
    rows.push({
      implementation,
      raw: data.length,
      gzip: Bun.gzipSync(data).length,
      path,
      samples: [],
    });
  }
  for (let sample = 0; sample < 7; sample++)
    for (const row of sample % 2 ? rows.toReversed() : rows) {
      const start = performance.now();
      const run = Bun.spawnSync([process.execPath, row.path], {
        cwd: directory,
      });
      const processMs = performance.now() - start;
      assert.equal(run.exitCode, 0, run.stderr.toString());
      row.samples.push({ ...JSON.parse(run.stdout.toString()), processMs });
    }
  console.log(
    JSON.stringify(
      {
        scope:
          "Same authored form; minified Bun SSR. Seven alternating fresh processes per implementation; first render, 1000 warmups, then 5000 timed renders. Process wall includes imports, warmup and workload; it is not a startup-only measurement. Svelte output includes comment markers. Machine contention is uncontrolled; no universal speed claim.",
        bun: Bun.version,
        svelte: JSON.parse(await readFile(hostPackage, "utf8")).version,
        source,
        results: rows.map(({ path: _path, ...row }) => ({
          ...row,
          median: {
            firstRenderMs: median(
              row.samples.map((value) => value.firstRenderMs),
            ),
            repeatedMs: median(row.samples.map((value) => value.repeatedMs)),
            processMs: median(row.samples.map((value) => value.processMs)),
          },
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
