import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { buildProject, type BuildOptions } from "../src/manifest";
import { canonicalPath } from "../src/path";
import { buildProjectIsolated } from "./build-in-subprocess";

async function fixture(run: (root: string, project: string) => Promise<void>) {
  const root = await mkdtemp(join(import.meta.dir, "fixtures/output-safety-"));
  const project = join(root, "project");
  try {
    await mkdir(join(project, "src/routes"), { recursive: true });
    await mkdir(join(project, "public"));
    await mkdir(join(project, "node_modules/@tschk"), { recursive: true });
    await symlink(
      join(import.meta.dir, "../../dom"),
      join(project, "node_modules/@tschk/moonshine-dom"),
      "dir",
    );
    await writeFile(
      join(project, "src/page.ts"),
      'export default () => "page";',
    );
    await writeFile(join(project, "public/keep.txt"), "asset");
    await run(root, project);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const options = (project: string, outDir: string): BuildOptions => ({
  projectDir: project,
  outDir,
  renderer: "native",
  programmatic: [{ id: "page", path: "/", file: "src/page.ts", mode: "ssr" }],
});

test("unsafe output overlap rejects before deleting any source or old output", async () => {
  await fixture(async (root, project) => {
    for (const outDir of [
      root,
      project,
      join(project, "src"),
      join(project, "src/routes"),
      join(project, "src/routes/generated"),
      join(project, "public"),
      join(project, "public/build"),
    ]) {
      await mkdir(outDir, { recursive: true });
      const sentinel = join(outDir, "old-output.txt");
      await writeFile(sentinel, "old");
      await expect(buildProject(options(project, outDir))).rejects.toThrow(
        /must not|must not overlap/,
      );
      expect(await readFile(sentinel, "utf8")).toBe("old");
      expect(await readFile(join(project, "src/page.ts"), "utf8")).toContain(
        "page",
      );
      expect(await readFile(join(project, "public/keep.txt"), "utf8")).toBe(
        "asset",
      );
    }
  });
});

test("every declared source kind is protected outside the discovered routes directory", async () => {
  await fixture(async (_root, project) => {
    const outDir = join(project, "owned");
    await mkdir(outDir);
    const source = join(outDir, "source.ts");
    await writeFile(source, 'export default () => "source";');
    for (const field of [
      "file",
      "clientFile",
      "dataFile",
      "errorBoundary",
      "layouts",
      "middleware",
    ] as const) {
      const config = options(project, outDir);
      const route = config.programmatic![0]!;
      if (field === "layouts" || field === "middleware")
        route[field] = [source];
      else route[field] = source;
      if (field === "clientFile") route.mode = "spa";
      await expect(buildProject(config)).rejects.toThrow(
        "must not contain source file",
      );
      expect(await readFile(source, "utf8")).toContain("source");
    }
  });
});

test("symlink parents cannot hide output overlap and missing paths canonicalize", async () => {
  await fixture(async (root, project) => {
    const alias = join(root, "alias");
    await symlink(project, alias, "dir");
    expect(await canonicalPath(join(alias, "missing/deeper"))).toBe(
      join(project, "missing/deeper"),
    );
    await expect(
      buildProject(options(project, join(alias, "src"))),
    ).rejects.toThrow("must not overlap");
    expect(await readFile(join(project, "src/page.ts"), "utf8")).toContain(
      "page",
    );
    const source = join(project, "owned/page.ts");
    await mkdir(join(project, "owned"));
    await writeFile(source, 'export default () => "owned";');
    const config = options(project, join(alias, "owned"));
    config.programmatic![0]!.file = source;
    await expect(buildProject(config)).rejects.toThrow(
      "must not contain source file",
    );
    expect(await readFile(source, "utf8")).toContain("owned");
  });
});

test("source symlink entries stay protected even when their targets are elsewhere", async () => {
  await fixture(async (root, project) => {
    const owned = join(project, "owned");
    await mkdir(owned);
    const source = join(owned, "page.ts");
    await symlink(join(project, "src/page.ts"), source);
    const alias = join(root, "alias");
    await symlink(project, alias, "dir");
    const config = options(project, join(alias, "owned"));
    config.programmatic![0]!.file = source;
    await expect(buildProject(config)).rejects.toThrow(
      "must not contain source file",
    );
    expect(await readFile(source, "utf8")).toContain("page");
  });
});

test("a sibling build directory under src is allowed without broad source bans", async () => {
  await fixture(async (_root, project) => {
    const outDir = join(project, "src/assets-build");
    await buildProjectIsolated(options(project, outDir));
    expect(await Bun.file(join(outDir, "manifest.json")).exists()).toBe(true);
    expect(await readFile(join(project, "src/page.ts"), "utf8")).toContain(
      "page",
    );
    expect(await readFile(join(project, "public/keep.txt"), "utf8")).toBe(
      "asset",
    );
  });
}, 20000);
