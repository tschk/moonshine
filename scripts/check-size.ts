import { mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const coreEntry = resolve(
  import.meta.dir,
  "..",
  "packages",
  "core",
  "src",
  "index.ts",
);
const outDir = join(tmpdir(), `moonshine-size-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [coreEntry],
  outdir: outDir,
  minify: true,
  format: "esm",
  target: "browser",
  splitting: false,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

let bytes = 0;
for (const output of result.outputs) {
  if (output.path.endsWith(".js")) {
    bytes += statSync(output.path).size;
  }
}

rmSync(outDir, { recursive: true, force: true });

const budget = 12 * 1024;
console.log(`core bundle: ${bytes} bytes (${(bytes / 1024).toFixed(2)} KiB)`);
if (bytes > budget) {
  console.error(`core bundle exceeds ${budget} byte budget`);
  process.exit(1);
}
