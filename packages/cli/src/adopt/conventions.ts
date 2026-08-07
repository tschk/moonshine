/** Host conventions present in the tree, named the way the user named them. */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Next conventions present in the tree, named the way the user named them. */
export function findConventions(projectDir: string, files: string[]): string[] {
  const seen: string[] = [];
  for (const candidate of [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "middleware.ts",
    "middleware.js",
    "src/middleware.ts",
    "instrumentation.ts",
  ]) {
    if (existsSync(join(projectDir, candidate))) seen.push(candidate);
  }
  for (const file of files) {
    const base = file.split("/").pop()!;
    const stem = base.replace(/\.[jt]sx?$/, "");
    if (
      [
        "layout",
        "route",
        "loading",
        "template",
        "not-found",
        "error",
        "default",
      ].includes(stem)
    ) {
      seen.push(file);
    }
  }
  return seen;
}

/** Source-level Next features with no moonshine equivalent yet. */
