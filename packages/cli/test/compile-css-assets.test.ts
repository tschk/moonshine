import { test, expect } from "bun:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { readCrepusGraph } from "../src/compile-graph";
import { publishCrepusGraph } from "../src/compile-output";
const target = "moonshine-dom",
  prefix = "modules/" + target + "/",
  entry = "CrepusEmit." + target + ".ts";
async function fixture(
  run: (dir: string, m: Record<string, unknown>) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "css-consumer-test-"));
  const files = {
    [entry]: `export {default} from './${prefix}App.ts';`,
    [prefix + "App.ts"]: `import './a.css'; export default ()=>1;`,
  };
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), source);
  }
  await writeFile(
    join(dir, prefix + "a.css"),
    '@import "./b.css";p{color:red}',
  );
  await writeFile(join(dir, prefix + "b.css"), "b{color:blue}");
  const m = {
    version: 1,
    target,
    entry,
    sourceEntry: "App.ts",
    sourceModule: prefix + "App.ts",
    files: Object.keys(files),
    assets: [prefix + "a.css", prefix + "b.css"],
  };
  await save(dir, m);
  try {
    await run(dir, m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function save(dir: string, m: object) {
  await writeFile(join(dir, "crepus-module-manifest.json"), JSON.stringify(m));
}
test("inventoried transitive CSS preserved byte-for-byte, published and bundled", () =>
  fixture(async (dir) => {
    const graph = (await readCrepusGraph(dir, target))!;
    expect(graph.files.length).toBe(4);
    const output = join(dir, "public.ts");
    await publishCrepusGraph(output, graph);
    const facade = await readFile(output, "utf8");
    expect(facade).toContain(".moonshine-compiled");
    const css = graph.files.filter((f) => f.path.endsWith(".css"));
    expect(css.map((f) => f.source)).toEqual([
      '@import "./b.css";p{color:red}',
      "b{color:blue}",
    ]);
    const build = await Bun.build({
      entrypoints: [output],
      outdir: join(dir, "build"),
      target: "browser",
    });
    expect(build.success).toBe(true);
    const built = await build.outputs
      .find((x) => x.path.endsWith(".css"))!
      .text();
    expect(built).toContain("color: red");
    expect(built).toContain("color: #00f");
  }));
test("invalid inventory paths, types, duplicates and symlinks reject", () =>
  fixture(async (dir, m) => {
    for (const assets of [
      ["../outside.css"],
      ["modules/moonshine-ssr/a.css"],
      [prefix + "a.png"],
      [prefix + "a.css", prefix + "a.css"],
      [prefix + "App.ts"],
      null,
    ]) {
      await save(dir, { ...m, assets });
      await expect(readCrepusGraph(dir, target)).rejects.toThrow();
    }
    await rm(join(dir, prefix + "b.css"));
    await symlink(join(dir, prefix + "a.css"), join(dir, prefix + "b.css"));
    await save(dir, m);
    await expect(readCrepusGraph(dir, target)).rejects.toThrow("symlink");
  }));
test("CSS references cannot read unlisted files and failure preserves prior facade", () =>
  fixture(async (dir) => {
    const output = join(dir, "public.ts");
    await publishCrepusGraph(output, (await readCrepusGraph(dir, target))!);
    const before = await readFile(output, "utf8");
    await writeFile(join(dir, prefix + "private.css"), "secret{}");
    for (const source of [
      '@import "./private.css";',
      '@import "../../../../private.css";',
      '@import "/tmp/private.css";',
      '@import "https://example.test/a.css";',
      "p{background:url(./private.css)}",
      "p{background:url(file:///tmp/private.css)}",
      "p{mask:url(#mask)}",
    ]) {
      await writeFile(join(dir, prefix + "a.css"), source);
      await expect(readCrepusGraph(dir, target)).rejects.toThrow();
      expect(await readFile(output, "utf8")).toBe(before);
    }
  }));
