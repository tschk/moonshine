import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("kernel bundles outside the workspace without runtime dependencies", async () => {
  const root = join(import.meta.dir, "..");
  const pkg = await Bun.file(join(root, "package.json")).json();
  expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  expect(Object.keys(pkg.optionalDependencies ?? {})).toEqual([]);
  // Bun file: installs include optional peers duplicated in local devDependencies.
  for (const host of ["react", "react-dom"]) {
    expect(pkg.devDependencies?.[host]).toBeUndefined();
  }
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    expect(pkg.peerDependenciesMeta[name]?.optional).toBe(true);
  }

  const dir = await mkdtemp(join(tmpdir(), "moonshine-kernel-"));
  try {
    await cp(join(root, "src"), join(dir, "src"), { recursive: true });
    const result = await Bun.build({
      entrypoints: [join(dir, "src/index.ts")],
      target: "browser",
      minify: true,
    });
    expect(result.logs).toEqual([]);
    expect(result.success).toBe(true);
    const output = join(dir, "kernel.mjs");
    await Bun.write(output, result.outputs[0]!);
    const process = Bun.spawn(
      [
        Bun.which("bun")!,
        "-e",
        `const kernel = await import(process.argv[1]);
       if ("isTracking" in kernel || "collectDeps" in kernel) throw new Error("optional tracking leaked into kernel entry");
       const { createSignal, createMemo } = kernel;
       const count = createSignal(1);
       const doubled = createMemo(() => count() * 2);
       if (doubled() !== 2) throw new Error("initial memo");
       count.set(3);
       if (doubled() !== 6) throw new Error("updated memo");`,
        output,
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const stderr = await new Response(process.stderr).text();
    expect(stderr).toBe("");
    expect(await process.exited).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
