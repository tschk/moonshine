import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("help and compile load without unrelated commands or packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-dispatch-"));
  try {
    await mkdir(join(root, "bin"));
    await mkdir(join(root, "src"));
    await copyFile(
      join(import.meta.dir, "../bin/moonshine.ts"),
      join(root, "bin/moonshine.ts"),
    );
    for (const file of ["compile.ts", "compile-graph.ts", "compile-output.ts"])
      await copyFile(
        join(import.meta.dir, "../src", file),
        join(root, "src", file),
      );
    const compiler = join(root, "node_modules/@tschk/moonshine-compiler");
    await mkdir(join(compiler, "src"), { recursive: true });
    await copyFile(
      join(import.meta.dir, "../../compiler/package.json"),
      join(compiler, "package.json"),
    );
    for (const file of [
      "source.ts",
      "crepus-source.ts",
      "compile-graph.ts",
      "compile-output.ts",
    ])
      await copyFile(
        join(import.meta.dir, "../../compiler/src", file),
        join(compiler, "src", file),
      );
    for (const [command, code, message] of [
      ["--help", 0, "Usage:"],
      ["compile", 1, "Usage: moonshine compile"],
      ["unknown", 1, "Unknown command: unknown"],
    ] as const) {
      const child = Bun.spawn(
        [process.execPath, join(root, "bin/moonshine.ts"), command],
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      );
      const [actualCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      expect(actualCode).toBe(code);
      expect(stderr).toContain(message);
      expect(stderr).not.toContain("Cannot find module");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
