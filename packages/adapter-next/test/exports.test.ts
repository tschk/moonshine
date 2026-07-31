import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(
  readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
) as { exports: Record<string, string> };

describe("@tschk/moonshine-next host libraries", () => {
  test("exports next library subpaths", () => {
    for (const key of [
      ".",
      "./client",
      "./server",
      "./navigation",
      "./link",
      "./image",
      "./headers",
      "./dynamic",
      "./shaders",
    ]) {
      expect(pkg.exports[key]).toBeTruthy();
    }
  });

  test("navigation module bridges next/navigation", () => {
    const src = readFileSync(
      join(import.meta.dir, "../src/navigation.ts"),
      "utf8",
    );
    expect(src).toContain("next/navigation");
    expect(src).toContain("usePathnameSignal");
    expect(src).toContain("useSearchParamSignal");
  });

  test("shaders module uses moonshine-shaders", () => {
    const src = readFileSync(
      join(import.meta.dir, "../src/shaders.ts"),
      "utf8",
    );
    expect(src).toContain("@tschk/moonshine-shaders");
    expect(src).toContain("useFragmentShader");
  });

  test("link/image re-export next packages", () => {
    expect(
      readFileSync(join(import.meta.dir, "../src/link.ts"), "utf8"),
    ).toContain("next/link");
    expect(
      readFileSync(join(import.meta.dir, "../src/image.ts"), "utf8"),
    ).toContain("next/image");
  });
});
