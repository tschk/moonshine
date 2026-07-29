import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("package release files", () => {
  test("every path in package.json files exists in the package root", async () => {
    const manifest = await Bun.file(join(packageRoot, "package.json")).json();
    const releaseFiles = manifest.files as string[];

    expect(Array.isArray(releaseFiles)).toBe(true);
    expect(releaseFiles.length).toBeGreaterThan(0);

    for (const entry of releaseFiles) {
      const absolute = join(packageRoot, entry);
      expect(existsSync(absolute)).toBe(true);
    }
  });
});
