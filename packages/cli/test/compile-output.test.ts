import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCrepusGraph } from "../src/compile-output";
import type { CrepusGraph } from "../src/compile-graph";

function graph(
  value: number,
  target = "moonshine-dom",
  defaultExport = true,
): CrepusGraph {
  const entry = `CrepusEmit.${target}.ts`;
  return {
    entry,
    files: [
      {
        path: entry,
        source: `export * from './modules/${target}/counter.ts';\n${defaultExport ? `export {default} from './modules/${target}/counter.ts';\n` : ""}`,
      },
      {
        path: `modules/${target}/counter.ts`,
        source: `export const value = ${value};\n${defaultExport ? "export default value;\n" : ""}`,
      },
    ],
  };
}

test("module publication isolates sources and targets and retains exact compiler bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-publish-"));
  try {
    const cases = [
      ["first.dom.ts", 2, "moonshine-dom", true],
      ["second.dom.ts", 7, "moonshine-dom", true],
      ["first.ssr.ts", 9, "moonshine-ssr", false],
    ] as const;
    for (const [name, value, target, hasDefault] of cases) {
      const output = join(root, name);
      const input = graph(value, target, hasDefault);
      await Promise.all([
        publishCrepusGraph(output, input),
        publishCrepusGraph(output, input),
      ]);
      const versions = await readdir(join(root, ".moonshine-compiled", name));
      expect(versions).toHaveLength(1);
      for (const file of input.files)
        expect(
          await readFile(
            join(root, ".moonshine-compiled", name, versions[0]!, file.path),
            "utf8",
          ),
        ).toBe(file.source);
    }
    // Bun caches directory entries during resolution, so publish before loading.
    for (const [name, value, , hasDefault] of cases) {
      const module = await import(join(root, name));
      expect(module.value).toBe(value);
      expect("default" in module).toBe(hasDefault);
    }
    expect(
      (await readdir(root)).some((name) =>
        name.startsWith(".moonshine-entry-"),
      ),
    ).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changing a graph publishes a new immutable version before replacing its entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-publish-rebuild-"));
  try {
    const output = join(root, "counter.dom.ts");
    await publishCrepusGraph(output, graph(1));
    const previous = await readFile(output, "utf8");
    await publishCrepusGraph(output, graph(2));
    expect(await readFile(output, "utf8")).not.toBe(previous);
    const versions = await readdir(
      join(root, ".moonshine-compiled", "counter.dom.ts"),
    );
    expect(versions).toHaveLength(2);
    expect((await import(output + "?rebuilt")).value).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("symlink artifact directories cannot redirect publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-publish-symlink-"));
  try {
    const outside = join(root, "untouched");
    await mkdir(outside);
    await symlink(outside, join(root, ".moonshine-compiled"));
    await expect(
      publishCrepusGraph(join(root, "counter.dom.ts"), graph(1)),
    ).rejects.toThrow("Unsafe compiled module directory");
    expect(await readdir(outside)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a corrupted existing graph is rejected without replacing the public entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-publish-corrupt-"));
  try {
    const output = join(root, "counter.dom.ts");
    const input = graph(1);
    await publishCrepusGraph(output, input);
    const previous = await readFile(output, "utf8");
    const base = join(root, ".moonshine-compiled", "counter.dom.ts");
    const [version] = await readdir(base);
    await writeFile(join(base, version!, input.entry), "corrupt");
    await expect(publishCrepusGraph(output, input)).rejects.toThrow(
      "Compiled module contents differ",
    );
    expect(await readFile(output, "utf8")).toBe(previous);
    expect(await readdir(base)).toEqual([version!]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
