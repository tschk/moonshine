import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, findConfig, defineConfig } from "../src/config";

const tmp = mkdtempSync(join(tmpdir(), "moonshine-config-"));
const validConfigPath = join(tmp, "moonshine.config.ts");
const stringConfigPath = join(tmp, "string-config.ts");
const nullConfigPath = join(tmp, "null-config.ts");

beforeAll(() => {
  writeFileSync(validConfigPath, `export default { adapter: "bun" };\n`);
  writeFileSync(stringConfigPath, `export default "invalid string config";\n`);
  writeFileSync(nullConfigPath, `export default null;\n`);
});

afterAll(() => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("loads valid config object", async () => {
    const config = await loadConfig(validConfigPath);
    expect(config).toEqual({ adapter: "bun" });
  });

  test("throws error if config default export is a string", async () => {
    expect(loadConfig(stringConfigPath)).rejects.toThrow(
      `Invalid moonshine config: ${stringConfigPath}`,
    );
  });

  test("throws error if config default export is null", async () => {
    expect(loadConfig(nullConfigPath)).rejects.toThrow(
      `Invalid moonshine config: ${nullConfigPath}`,
    );
  });
});

describe("findConfig", () => {
  test("finds config if exists", () => {
    expect(findConfig(tmp)).toBe(validConfigPath);
  });

  test("returns undefined if no config exists", () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), "moonshine-empty-"));
    try {
      expect(findConfig(emptyTmp)).toBeUndefined();
    } finally {
      if (existsSync(emptyTmp))
        rmSync(emptyTmp, { recursive: true, force: true });
    }
  });
});

describe("defineConfig", () => {
  test("returns config unchanged", () => {
    const config = { adapter: "bun" as const };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });
});