import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, findConfig, defineConfig } from "../src/config";

const tmp = resolve(mkdtempSync(join(tmpdir(), "moonshine-config-")));
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

  test("finds config if moonshine.config.js exists", () => {
    const jsTmp = resolve(mkdtempSync(join(tmpdir(), "moonshine-js-")));
    try {
      const jsConfigPath = join(jsTmp, "moonshine.config.js");
      writeFileSync(jsConfigPath, `export default { adapter: "node" };\n`);
      expect(findConfig(jsTmp)).toBe(jsConfigPath);
    } finally {
      if (existsSync(jsTmp)) rmSync(jsTmp, { recursive: true, force: true });
    }
  });

  test("returns undefined if no config exists", () => {
    const emptyTmp = resolve(mkdtempSync(join(tmpdir(), "moonshine-empty-")));
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
