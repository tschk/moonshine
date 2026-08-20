import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findConfig, loadConfig, defineConfig } from "../src/config";

describe("config", () => {
  const testDir = join(process.cwd(), "test-config-tmp");

  beforeAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("defineConfig should return the config", () => {
    const config = { adapter: "bun" as const };
    expect(defineConfig(config)).toEqual(config);
  });

  test("findConfig should return undefined if no config is found", () => {
    const noConfigDir = join(testDir, "no-config");
    mkdirSync(noConfigDir);
    expect(findConfig(noConfigDir)).toBeUndefined();
  });

  test("findConfig should find moonshine.config.ts", () => {
    const tsDir = join(testDir, "ts-config");
    mkdirSync(tsDir);
    const tsFile = join(tsDir, "moonshine.config.ts");
    writeFileSync(tsFile, "export default {}");

    expect(findConfig(tsDir)).toBe(tsFile);
  });

  test("findConfig should find moonshine.config.js", () => {
    const jsDir = join(testDir, "js-config");
    mkdirSync(jsDir);
    const jsFile = join(jsDir, "moonshine.config.js");
    writeFileSync(jsFile, "module.exports = {}");

    expect(findConfig(jsDir)).toBe(jsFile);
  });

  test("findConfig should prioritize moonshine.config.ts over moonshine.config.js", () => {
    const bothDir = join(testDir, "both-config");
    mkdirSync(bothDir);
    const tsFile = join(bothDir, "moonshine.config.ts");
    const jsFile = join(bothDir, "moonshine.config.js");
    writeFileSync(tsFile, "export default {}");
    writeFileSync(jsFile, "module.exports = {}");

    expect(findConfig(bothDir)).toBe(tsFile);
  });

  test("loadConfig should successfully load a ts config module", async () => {
    const loadDir = join(testDir, "load-config-ts");
    mkdirSync(loadDir);
    const tsFile = join(loadDir, "moonshine.config.ts");
    writeFileSync(tsFile, `export default { adapter: "bun" }`);

    const config = await loadConfig(tsFile);
    expect(config.adapter).toBe("bun");
  });

  test("loadConfig should successfully load a js config module", async () => {
    const loadDir = join(testDir, "load-config-js");
    mkdirSync(loadDir);
    const jsFile = join(loadDir, "moonshine.config.js");
    writeFileSync(jsFile, `module.exports = { adapter: "node" }`);

    const config = await loadConfig(jsFile);
    expect(config.adapter).toBe("node");
  });

  test("loadConfig should throw if config is not an object", async () => {
    const loadDir = join(testDir, "load-config-invalid");
    mkdirSync(loadDir);
    const tsFile = join(loadDir, "moonshine.config.ts");
    writeFileSync(tsFile, `export default 123`);

    expect(loadConfig(tsFile)).rejects.toThrow("Invalid moonshine config:");
  });
});
