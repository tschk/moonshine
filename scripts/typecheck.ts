#!/usr/bin/env bun
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const bin = process.argv[2] === "native" ? "tsgo" : "tsc";

function projects(): string[] {
  const found: string[] = [];
  const packagesDir = join(root, "packages");
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const config = join(packagesDir, entry.name, "tsconfig.json");
    if (existsSync(config)) found.push(config);
  }
  const components = join(root, "components", "tsconfig.json");
  if (existsSync(components)) found.push(components);
  return found.sort();
}

const queue = projects();
const limit = Math.min(queue.length, navigator.hardwareConcurrency || 4);
let failed = 0;
let next = 0;

async function worker(): Promise<void> {
  while (next < queue.length) {
    const config = queue[next++]!;
    const label = relative(root, config);
    const proc = Bun.spawn(["bun", "x", bin, "--noEmit", "-p", config], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code === 0) {
      console.log(`ok  ${label}`);
    } else {
      failed++;
      console.error(`FAIL ${label}`);
      if (out.trim()) console.error(out.trim());
      if (err.trim()) console.error(err.trim());
    }
  }
}

await Promise.all(Array.from({ length: limit }, worker));

if (failed) {
  console.error(`typecheck (${bin}): ${failed} project(s) failed`);
  process.exit(1);
}
console.log(`typecheck (${bin}): ${queue.length} projects OK`);
