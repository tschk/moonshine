import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  readCrepusGraph,
  validateNativeRuntimeImport,
  type CrepusGraph,
} from "./compile-graph";

export function requireCrepusCompiler(compiler?: string): string {
  const executable = Bun.which(compiler ?? "crepus");
  if (!executable)
    throw new Error(
      `Crepus compiler not found: ${compiler ?? "crepus"}; install a compiler with native emission or pass --compiler <path>`,
    );
  return executable;
}

/** Delegate source parsing/lowering; never writes inside the source project. */
export async function emitCrepusSource(
  abs: string,
  target: "moonshine-dom" | "moonshine-ssr" | "react",
  compiler?: string,
  site?: string,
): Promise<{
  source: string;
  ir?: { version?: number; root?: unknown[] };
  graph?: CrepusGraph;
}> {
  const executable = requireCrepusCompiler(compiler);
  const root = resolve(site ?? dirname(abs));
  const entry = relative(root, abs);
  if (
    !entry ||
    entry === ".." ||
    entry.startsWith(`..${sep}`) ||
    isAbsolute(entry)
  )
    throw new Error("Source must be a file inside --site");
  const temporary = await mkdtemp(join(tmpdir(), "moonshine-compile-"));
  try {
    const child = Bun.spawn(
      [
        executable,
        "web",
        "build",
        "--site",
        root,
        "--entry",
        entry.split(sep).join("/"),
        "--out-dir",
        temporary,
        "--emit",
        target,
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0)
      throw new Error(
        `Crepus compilation failed (exit ${code}): ${stderr || stdout}`,
      );
    const generated = join(
      temporary,
      `CrepusEmit.${target}.` + (target === "react" ? "tsx" : "ts"),
    );
    try {
      await access(generated);
    } catch {
      throw new Error(
        `Crepus compiler did not emit expected file: ${basename(generated)}`,
      );
    }
    const graph =
      target === "react" ? undefined : await readCrepusGraph(temporary, target);
    const source = await readFile(generated, "utf8");
    const transpiler = new Bun.Transpiler({
      loader: target === "react" ? "tsx" : "ts",
    });
    transpiler.transformSync(source);
    for (const dependency of transpiler.scan(source).imports) {
      if (target !== "react") validateNativeRuntimeImport(dependency.path);
      if (
        !graph &&
        /^(?:\.{1,2}(?:[\\/]|$)|[\\/]|[a-z]:|file:)/i.test(dependency.path)
      ) {
        throw new Error(
          `Crepus emitted unsupported filesystem import ${JSON.stringify(dependency.path)}; companion modules/assets require an upstream asset contract`,
        );
      }
    }
    let ir: { version?: number; root?: unknown[] } | undefined;
    try {
      ir = JSON.parse(
        await readFile(join(temporary, "crepus-view-ir.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { source, ir, ...(graph && { graph }) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
