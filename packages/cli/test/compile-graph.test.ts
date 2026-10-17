import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readCrepusGraph } from "../src/compile-graph";

const target = "moonshine-dom";
const entry = `CrepusEmit.${target}.ts`;
const root = `modules/${target}/`;
async function fixture(
  run: (dir: string, manifest: Record<string, unknown>) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-graph-"));
  try {
    const files = {
      [entry]: `export { default } from './${root}app.tsx';`,
      [root + "app.tsx"]: "export { default } from './nested/child';",
      [root + "nested/child.ts"]:
        "export {value as default} from '../state'; export const later=()=>import('../state');",
      [root + "state.ts"]: "import 'node:path'; export const value=1;",
    };
    for (const [path, source] of Object.entries(files)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), source);
    }
    const manifest = {
      version: 1,
      target,
      entry,
      sourceEntry: "app.tsx",
      files: Object.keys(files),
    };
    await writeFile(
      join(dir, "crepus-module-manifest.json"),
      JSON.stringify(manifest),
    );
    await run(dir, manifest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("reads unchanged transitive target module graph and optional absent manifest", async () => {
  await fixture(async (dir) => {
    const graph = await readCrepusGraph(dir, target);
    expect(graph?.entry).toBe(entry);
    expect(graph?.files.length).toBe(4);
    expect(graph?.files[3]?.source).toBe(
      "import 'node:path'; export const value=1;",
    );
    await rm(join(dir, "crepus-module-manifest.json"));
    expect(await readCrepusGraph(dir, target)).toBeUndefined();
  });
});

test.each([
  ["moonshine-dom", "svelte"],
  ["moonshine-ssr", "svelte"],
  ["moonshine-dom", "vue"],
  ["moonshine-ssr", "vue"],
] as const)(
  "reads an explicit remapped SFC entry beside its JavaScript companion: %s %s",
  async (graphTarget, extension) => {
    await fixture(async (dir) => {
      const facadePath = `CrepusEmit.${graphTarget}.ts`;
      const prefix = `modules/${graphTarget}/`;
      const sourceModule = prefix + `counter.${extension}.__crepus0.ts`;
      const companion = prefix + `counter.${extension}.js`;
      const sources = {
        [facadePath]: `export {default} from './${sourceModule}';`,
        [sourceModule]: `import {createCounter} from './counter.${extension}.js'; export default () => createCounter();`,
        [companion]: "export const createCounter=()=>1;",
      };
      for (const [path, source] of Object.entries(sources)) {
        await mkdir(dirname(join(dir, path)), { recursive: true });
        await writeFile(join(dir, path), source);
      }
      const manifest = {
        version: 1,
        target: graphTarget,
        entry: facadePath,
        sourceEntry: `counter.${extension}`,
        sourceModule,
        files: Object.keys(sources),
      };
      const manifestPath = join(dir, "crepus-module-manifest.json");
      await writeFile(manifestPath, JSON.stringify(manifest));
      expect(await readCrepusGraph(dir, graphTarget)).toEqual({
        entry: facadePath,
        files: Object.entries(sources).map(([path, source]) => ({
          path,
          source,
        })),
      });
      for (const invalid of [
        null,
        1,
        "../outside.ts",
        "modules/other/counter.ts",
        prefix + "missing.ts",
        companion,
      ]) {
        await writeFile(
          manifestPath,
          JSON.stringify({ ...manifest, sourceModule: invalid }),
        );
        await expect(readCrepusGraph(dir, graphTarget)).rejects.toThrow();
      }
      await writeFile(manifestPath, JSON.stringify(manifest));
      await writeFile(
        join(dir, facadePath),
        `export {createCounter as default} from './${companion}';`,
      );
      await expect(readCrepusGraph(dir, graphTarget)).rejects.toThrow(
        "entry does not reference sourceEntry module",
      );
      const legacyCompanion = prefix + `counter.${extension}.ts`;
      const legacy: Record<string, unknown> = {
        ...manifest,
        files: [facadePath, sourceModule, legacyCompanion],
      };
      delete legacy.sourceModule;
      await writeFile(manifestPath, JSON.stringify(legacy));
      await writeFile(join(dir, facadePath), sources[facadePath]!);
      await writeFile(
        join(dir, sourceModule),
        `import {createCounter} from './counter.${extension}.ts'; export default () => createCounter();`,
      );
      await writeFile(join(dir, legacyCompanion), sources[companion]!);
      expect((await readCrepusGraph(dir, graphTarget))?.files).toHaveLength(3);
    });
  },
);

test.each([
  { version: 2 },
  { target: "moonshine-ssr" },
  { entry: "other.ts" },
  { sourceEntry: "../app.tsx" },
  { files: [entry, entry] },
  { files: [entry, root + "../other.ts"] },
  { files: [entry, "modules/moonshine-ssr/app.tsx"] },
  { files: [entry, root + "missing.ts"] },
  { files: [entry, root + "app.tsx", root + "a\\b.ts"] },
])("rejects malformed/incomplete inventory %j", async (patch) => {
  await fixture(async (dir, manifest) => {
    await writeFile(
      join(dir, "crepus-module-manifest.json"),
      JSON.stringify({ ...manifest, ...patch }),
    );
    await expect(readCrepusGraph(dir, target)).rejects.toThrow();
  });
});

test.each([
  "./missing",
  "../moonshine-ssr/app.ts",
  "/absolute.ts",
  "C:\\file.ts",
  "file:///tmp/file.ts",
  "./nested\\child.ts",
])("rejects unsupported dependency %s", async (specifier) => {
  await fixture(async (dir) => {
    await writeFile(
      join(dir, root + "app.tsx"),
      `export * from ${JSON.stringify(specifier)};`,
    );
    await expect(readCrepusGraph(dir, target)).rejects.toThrow();
  });
});

test("rejects ambiguous imports, bad syntax, missing files and symlink components", async () => {
  await fixture(async (dir, manifest) => {
    await writeFile(join(dir, root + "state.tsx"), "export const value=2;");
    (manifest.files as string[]).push(root + "state.tsx");
    await writeFile(
      join(dir, "crepus-module-manifest.json"),
      JSON.stringify(manifest),
    );
    await expect(readCrepusGraph(dir, target)).rejects.toThrow("ambiguous");
    await writeFile(join(dir, root + "nested/child.ts"), "export const = ;");
    await expect(readCrepusGraph(dir, target)).rejects.toThrow();
    await rm(join(dir, root + "nested"), { recursive: true });
    await symlink(join(dir, root), join(dir, root + "nested"));
    await expect(readCrepusGraph(dir, target)).rejects.toThrow();
    await rm(join(dir, root + "nested"));
    await expect(readCrepusGraph(dir, target)).rejects.toThrow();
  });
});

test("uppercase source extensions preserve inventory paths and compiler bytes", async () => {
  await fixture(async (dir, manifest) => {
    const source = '// uppercase source\nexport default "preserved";\n';
    const facade = `export {default} from './${root}Counter.TSX';`;
    await writeFile(join(dir, root + "Counter.TSX"), source);
    await writeFile(join(dir, entry), facade);
    manifest.sourceEntry = "Counter.TSX";
    manifest.files = [entry, root + "Counter.TSX"];
    await writeFile(
      join(dir, "crepus-module-manifest.json"),
      JSON.stringify(manifest),
    );
    expect(await readCrepusGraph(dir, target)).toEqual({
      entry,
      files: [
        { path: entry, source: facade },
        { path: root + "Counter.TSX", source },
      ],
    });
  });
});

test("Svelte source entries require their inventoried lowered TypeScript module", async () => {
  await fixture(async (dir, manifest) => {
    const source = "export default function Counter(){return 'native';}";
    const path = root + "Counter.svelte.ts";
    const facade = `export {default} from './${path}';`;
    await writeFile(join(dir, path), source);
    await writeFile(join(dir, entry), facade);
    manifest.sourceEntry = "Counter.svelte";
    manifest.files = [entry, path];
    const manifestPath = join(dir, "crepus-module-manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect(await readCrepusGraph(dir, target)).toEqual({
      entry,
      files: [
        { path: entry, source: facade },
        { path, source },
      ],
    });
    manifest.files = [entry];
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(readCrepusGraph(dir, target)).rejects.toThrow(
      "entry or sourceEntry is not listed",
    );
  });
});

test.each([
  "import {createSignal} from 'solid-js'; export const value=createSignal(0);",
  "export {createStore} from 'solid-js/store';",
  "export const later=()=>import('solid-js/web');",
  "import {onMount} from 'svelte'; export {onMount};",
  "export const later=()=>import('svelte/internal/client');",
  "import {useState} from 'react'; export const value=useState(0);",
  "export {jsx} from 'react/jsx-runtime';",
  "export const later=()=>import('react/jsx-dev-runtime');",
  "export {createRoot} from 'react-dom/client';",
  "export const later=()=>import('react-dom/server');",
  "import {ref} from 'vue'; export const value=ref(0);",
  "export {ref} from 'vue/dist/vue.runtime.esm-browser.js';",
  "export const later=()=>import('@vue/reactivity');",
  "export {h} from '@vue/runtime-core';",
  "import '@vue/runtime-dom/dist/runtime-dom.esm-browser.js';",
  "import '@vue/shared';",
  "export {renderToString} from '@vue/server-renderer';",
])(
  "rejects host runtime imports in transitive native modules: %s",
  async (source) => {
    await fixture(async (dir) => {
      await writeFile(join(dir, root + "state.ts"), source);
      await expect(readCrepusGraph(dir, target)).rejects.toThrow(
        "Unsupported native runtime import",
      );
    });
  },
);

test("type-only host declarations and unrelated package names remain allowed", async () => {
  await fixture(async (dir) => {
    await writeFile(
      join(dir, root + "state.ts"),
      "import type {Accessor} from 'solid-js'; import type {ReactNode} from 'react'; import {type Ref} from 'vue'; export {type Ref as VueRef} from '@vue/reactivity'; import 'vue-extra'; import '@vue/runtime-dom-extra'; import '@vue/compiler-sfc'; import 'solid-js-extra'; import 'react-extra'; import 'react-dom-extra'; export const value:Accessor<number>=()=>1; export type Child=ReactNode;",
    );
    expect((await readCrepusGraph(dir, target))?.files).toHaveLength(4);
  });
});
