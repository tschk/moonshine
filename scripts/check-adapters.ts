#!/usr/bin/env bun
/**
 * Verify every adapter package.json export target exists on disk.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "packages");
const adapters = readdirSync(root).filter((n) => n.startsWith("adapter-"));

let failed = 0;

for (const name of adapters) {
  const dir = join(root, name);
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    console.error(`missing package.json: ${name}`);
    failed++;
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    name: string;
    exports?: Record<string, string>;
  };
  const exports = pkg.exports ?? { ".": "./src/index.ts" };
  for (const [key, target] of Object.entries(exports)) {
    const file = join(dir, target);
    if (!existsSync(file)) {
      console.error(`${pkg.name} export ${key} -> missing ${target}`);
      failed++;
    }
  }
  // expected peer or real host surface marker
  const srcDir = join(dir, "src");
  if (!existsSync(srcDir)) {
    console.error(`${pkg.name}: no src/`);
    failed++;
  }
}

if (failed) {
  console.error(`\ncheck-adapters: ${failed} problem(s)`);
  process.exit(1);
}
console.log(`check-adapters: ${adapters.length} adapters OK`);
