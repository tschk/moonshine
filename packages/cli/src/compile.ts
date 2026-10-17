import { access, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  emitCrepusSource,
  publishCrepusGraph,
} from "@tschk/moonshine-compiler/source";
export {
  emitCrepusSource,
  requireCrepusCompiler,
} from "@tschk/moonshine-compiler/source";

async function emitTsxFromIr(ir: unknown, outPath: string): Promise<void> {
  const json = JSON.stringify(ir, null, 2);
  const src = `import { createApp } from "@tschk/moonshine/react";
import { renderCrepusIr, type ViewIr } from "@tschk/crepus-moonshine";

const ir = ${json} as ViewIr;

function App() {
  return renderCrepusIr(ir);
}

createApp({ root: App }).mount("#app");
`;
  await writeFile(outPath, src);
  console.log(`Wrote ${outPath}`);
}

export async function compileCommand(args: string[]): Promise<void> {
  let input: string | undefined;
  let compiler: string | undefined;
  let site: string | undefined;
  let target: "moonshine-dom" | "moonshine-ssr" | "react" = "moonshine-dom";
  let selected = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--ssr" || arg === "--react") {
      if (selected) throw new Error("Choose only one of --ssr or --react");
      selected = true;
      target = arg === "--ssr" ? "moonshine-ssr" : "react";
    } else if (arg === "--compiler" || arg === "--site") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a path`);
      if (arg === "--compiler") compiler = value;
      else site = value;
    } else if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}`);
    else if (input) throw new Error(`Unexpected argument: ${arg}`);
    else input = arg;
  }
  if (!input)
    throw new Error(
      "Usage: moonshine compile <source> [--ssr|--react] [--compiler <path>] [--site <root>]",
    );
  const abs = resolve(input);
  try {
    await access(abs);
  } catch {
    throw new Error(`File not found: ${abs}`);
  }
  const extension = extname(abs);
  const ext = extension.toLowerCase();
  const suffix =
    target === "react"
      ? ext === ".json"
        ? ".tsx"
        : ".react.tsx"
      : target === "moonshine-ssr"
        ? ".ssr.ts"
        : ".dom.ts";
  const outPath = join(dirname(abs), `${basename(abs, extension)}${suffix}`);
  if (ext === ".json") {
    if (target !== "react")
      throw new Error(
        "Native JSON IR emission is unavailable; compile frontend source or use --react for legacy JSON IR output",
      );
    await emitTsxFromIr(JSON.parse(await readFile(abs, "utf8")), outPath);
    return;
  }
  // Crepus web/build.rs is_framework_template defines this frontend contract.
  if (
    ![
      ".crepus",
      ".jsx",
      ".tsx",
      ".csx",
      ".svelte",
      ".vue",
      ".astro",
      ".ng",
      ".html",
    ].includes(ext)
  ) {
    throw new Error(`Unsupported source extension: ${ext}`);
  }
  const { source, graph } = await emitCrepusSource(abs, target, compiler, site);
  if (graph) await publishCrepusGraph(outPath, graph);
  else await writeFile(outPath, source);
  console.log(`Wrote ${outPath}`);
}
