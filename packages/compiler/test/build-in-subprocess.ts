import { resolve } from "node:path";
import type { BuildOptions } from "../src/manifest";

/**
 * Run `buildProject` in a child process. `Bun.build` is not safe to overlap
 * in one process with other test files that also bundle.
 */
export async function buildProjectIsolated(
  options: BuildOptions,
): Promise<void> {
  const runner = resolve(import.meta.dir, "run-build-project.ts");
  const proc = Bun.spawn(["bun", runner], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify(options));
  proc.stdin.end();
  const [code, err] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(`buildProject subprocess exited ${code}: ${err}`);
  }
}
