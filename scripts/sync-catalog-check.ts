#!/usr/bin/env bun
/**
 * Fail if catalog component ids drift from named component exports in
 * components/src/index.ts (charts / primitives / motion only).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const catalogPath = resolve(root, "components/catalog/components.json");
const indexPath = resolve(root, "components/src/index.ts");

type Catalog = {
  components: Array<{ id: string }>;
};

function idToExport(id: string): string {
  return id
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function parseComponentExports(source: string): Set<string> {
  const names = new Set<string>();
  const re =
    /export\s*\{([^}]+)\}\s*from\s*["']\.\/(?:charts|primitives|motion)\/[^"']+["']/g;
  for (const match of source.matchAll(re)) {
    const clause = match[1]!;
    for (const part of clause.split(",")) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("type ")) continue;
      const name = trimmed.split(/\s+as\s+/).at(-1)!.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;
const indexSource = readFileSync(indexPath, "utf8");
const exports = parseComponentExports(indexSource);

const catalogExports = new Map(
  catalog.components.map((c) => [idToExport(c.id), c.id] as const),
);

const missingInIndex: string[] = [];
for (const [exportName, id] of catalogExports) {
  if (!exports.has(exportName)) {
    missingInIndex.push(`${id} → ${exportName}`);
  }
}

const missingInCatalog: string[] = [];
for (const name of exports) {
  if (!catalogExports.has(name)) {
    missingInCatalog.push(name);
  }
}

if (missingInIndex.length || missingInCatalog.length) {
  console.error("Catalog sync check failed:");
  if (missingInIndex.length) {
    console.error("  In catalog but missing from index.ts:");
    for (const line of missingInIndex) console.error(`    - ${line}`);
  }
  if (missingInCatalog.length) {
    console.error("  Exported from index.ts but missing from catalog:");
    for (const line of missingInCatalog) console.error(`    - ${line}`);
  }
  process.exit(1);
}

console.log(
  `Catalog sync OK: ${catalog.components.length} ids ↔ ${exports.size} exports`,
);
