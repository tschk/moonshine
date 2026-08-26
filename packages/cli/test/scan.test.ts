import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { detectTemplateFramework, GENERATED_ROUTES } from "../src/adopt/scan";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const tmp = join(import.meta.dir, ".tmp-cli-scan");

describe("detectTemplateFramework", () => {
  beforeAll(() => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("detects svelte via dependency", () => {
    const projectDir = join(tmp, "svelte-dep");
    mkdirSync(projectDir);
    expect(detectTemplateFramework(projectDir, { svelte: "1.0.0" })).toEqual({
      framework: "svelte",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects svelte via config file", () => {
    const projectDir = join(tmp, "svelte-config");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "svelte.config.js"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "svelte",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects svelte via template file", () => {
    const projectDir = join(tmp, "svelte-file");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "app.svelte"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "svelte",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects vue via dependency", () => {
    const projectDir = join(tmp, "vue-dep");
    mkdirSync(projectDir);
    expect(detectTemplateFramework(projectDir, { vue: "3.0.0" })).toEqual({
      framework: "vue",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects vue via config file", () => {
    const projectDir = join(tmp, "vue-config");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "vue.config.js"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "vue",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects vue via template file", () => {
    const projectDir = join(tmp, "vue-file");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "app.vue"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "vue",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects astro via dependency", () => {
    const projectDir = join(tmp, "astro-dep");
    mkdirSync(projectDir);
    expect(detectTemplateFramework(projectDir, { astro: "2.0.0" })).toEqual({
      framework: "astro",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects astro via config file", () => {
    const projectDir = join(tmp, "astro-config");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "astro.config.mjs"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "astro",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects astro via template file", () => {
    const projectDir = join(tmp, "astro-file");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "page.astro"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "astro",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects angular via dependency", () => {
    const projectDir = join(tmp, "angular-dep");
    mkdirSync(projectDir);
    expect(
      detectTemplateFramework(projectDir, { "@angular/core": "15.0.0" }),
    ).toEqual({
      framework: "angular",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects angular via config file", () => {
    const projectDir = join(tmp, "angular-config");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "angular.json"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "angular",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("detects angular via template file", () => {
    const projectDir = join(tmp, "angular-file");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "app.component.html"), "");
    expect(detectTemplateFramework(projectDir, {})).toEqual({
      framework: "angular",
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    });
  });

  test("returns undefined when no framework is detected", () => {
    const projectDir = join(tmp, "no-framework");
    mkdirSync(projectDir);
    expect(detectTemplateFramework(projectDir, {})).toBeUndefined();
  });
});
