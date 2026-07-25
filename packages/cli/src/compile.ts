import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

function which(bin: string): string | null {
  const path = process.env.PATH ?? "";
  for (const dir of path.split(":")) {
    const candidate = join(dir, bin);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function emitTsxFromIr(ir: unknown, outPath: string): void {
  const json = JSON.stringify(ir, null, 2);
  const src = `import { createApp } from "@tschk/moonshine/react";
import { renderCrepusIr, type ViewIr } from "@tschk/crepus-moonshine";

const ir = ${json} as ViewIr;

function App() {
  return renderCrepusIr(ir);
}

createApp({ root: App }).mount("#app");
`;
  writeFileSync(outPath, src);
  console.log(`Wrote ${outPath}`);
}

export async function compileCommand(args: string[]): Promise<void> {
  const input = args[0];
  if (!input) {
    console.error("Usage: moonshine compile <file.crepus|file.json>");
    process.exit(1);
  }

  const abs = resolve(process.cwd(), input);
  if (!existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const ext = extname(abs).toLowerCase();
  const outPath = join(dirname(abs), `${basename(abs, ext)}.tsx`);

  if (ext === ".json") {
    const ir = JSON.parse(readFileSync(abs, "utf8"));
    emitTsxFromIr(ir, outPath);
    return;
  }

  if (ext === ".crepus") {
    const crepus = which("crepus");
    if (crepus) {
      const proc = Bun.spawn(
        [crepus, "web", "build", "--emit", "moonshine", abs],
        {
          cwd: dirname(abs),
          stdout: "inherit",
          stderr: "inherit",
        },
      );
      const code = await proc.exited;
      if (code !== 0) process.exit(code);
      console.log(`crepus emit finished for ${abs}`);
      return;
    }

    console.error(
      `No \`crepus\` on PATH and input is .crepus (not JSON IR).

Install crepus (≥ 0.11) and retry, or pass View IR JSON:

  moonshine compile view.json

Hint: crepus web build --emit moonshine ${input}`,
    );
    process.exit(1);
  }

  console.error(`Unsupported extension: ${ext} (expected .crepus or .json)`);
  process.exit(1);
}
