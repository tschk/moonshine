import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildProjectIsolated } from "./build-in-subprocess";
import { readManifest } from "../src/manifest";

test("native Node builds select Node package exports and render under actual Node", async () => {
  const root = await mkdtemp(join(import.meta.dir, "fixtures/native-node-"));
  try {
    await mkdir(join(root, "src/routes"), { recursive: true });
    await mkdir(join(root, "node_modules/@tschk"), { recursive: true });
    await symlink(
      resolve(import.meta.dir, "../../dom"),
      join(root, "node_modules/@tschk/moonshine-dom"),
    );
    const conditional = join(root, "node_modules/runtime-choice");
    await mkdir(conditional);
    await writeFile(
      join(conditional, "package.json"),
      JSON.stringify({
        name: "runtime-choice",
        type: "module",
        exports: { bun: "./bun.js", node: "./node.js", default: "./bun.js" },
      }),
    );
    await writeFile(
      join(conditional, "bun.js"),
      'export default "BUN_BRANCH_ONLY";',
    );
    await writeFile(
      join(conditional, "node.js"),
      'export default "NODE_BRANCH_ONLY";',
    );
    await writeFile(
      join(root, "page.ts"),
      `import runtime from 'runtime-choice';
import {h} from '@tschk/moonshine-dom/ssr';
export default () => h('p', null, runtime);`,
    );
    await buildProjectIsolated({
      projectDir: root,
      renderer: "native",
      runtime: "node",
      programmatic: [{ id: "page", path: "/", file: "page.ts", mode: "ssr" }],
    });
    const bundle = join(root, ".moonshine/dist/server.js");
    const source = await Bun.file(bundle).text();
    expect(source).toContain("NODE_BRANCH_ONLY");
    expect(source).not.toContain("BUN_BRANCH_ONLY");
    const manifest = await readManifest(join(root, ".moonshine/manifest.json"));
    const probe = join(root, "probe.mjs");
    await writeFile(
      probe,
      `import {renderer} from ${JSON.stringify(pathToFileURL(bundle).href)};
if(typeof Bun !== 'undefined') throw Error('Bun must not be available');
const response=await renderer.render({request:new Request('http://localhost/'),route:${JSON.stringify(manifest.routes[0])},params:{},data:{},signal:new AbortController().signal});
console.log(await response.text());`,
    );
    const child = Bun.spawn(["node", probe], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain("<p>NODE_BRANCH_ONLY</p>");
    const previousManifest = await Bun.file(
      join(root, ".moonshine/manifest.json"),
    ).text();
    await expect(
      buildProjectIsolated({
        projectDir: root,
        renderer: "native",
        programmatic: [
          {
            id: "bun",
            path: "/bun",
            file: "page.ts",
            runtime: "bun",
            mode: "ssr",
          },
          {
            id: "node",
            path: "/node",
            file: "page.ts",
            runtime: "node",
            mode: "ssr",
          },
        ],
      }),
    ).rejects.toThrow("one server runtime");
    expect(await Bun.file(join(root, ".moonshine/manifest.json")).text()).toBe(
      previousManifest,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
