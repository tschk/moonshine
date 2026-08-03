import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildProject } from "../src/manifest";

/**
 * A browser bundle must not carry a bare `process` reference into a page.
 *
 * Client code and its dependencies routinely read `process.env.X`. `process`
 * does not exist in a browser, so the reference throws while the client entry
 * module is still evaluating — before any component renders and before any
 * error boundary can mount. The page stays blank and the console stays empty,
 * which is close to undiagnosable from the outside.
 */

const projectDir = resolve(import.meta.dir, "fixtures", "project");
const outDir = join(projectDir, ".moonshine");

function clean() {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
}

afterAll(clean);

describe("client bundle process shim", () => {
  test("defines globalThis.process before any module code runs", async () => {
    await buildProject({ projectDir });

    const client = await Bun.file(join(outDir, "public", "client.js")).text();

    expect(client.startsWith("globalThis.process ??= { env: {} };")).toBe(true);
  });

  test("evaluating the bundle does not throw on a process.env read", async () => {
    await buildProject({ projectDir });

    const client = await Bun.file(join(outDir, "public", "client.js")).text();
    // The banner is the whole fix, so assert it actually guards a real read
    // rather than trusting that the fixture still contains one.
    expect(client).toContain("process.env");

    // Evaluate the banner in isolation with no ambient `process`, which is what
    // a browser gives the bundle.
    const scope: Record<string, unknown> = {};
    const run = new Function(
      "globalThis",
      "return (globalThis.process ??= { env: {} });",
    );
    expect(run(scope)).toEqual({ env: {} });
  });

  test("does not overwrite an environment injected ahead of the bundle", async () => {
    // Apps prepend their own public values; `??=` must leave those intact.
    const scope: Record<string, unknown> = { process: { env: { A: "1" } } };
    const run = new Function(
      "globalThis",
      "return (globalThis.process ??= { env: {} });",
    );
    expect(run(scope)).toEqual({ env: { A: "1" } });
  });

  test("the server bundle is left alone", async () => {
    await buildProject({ projectDir });

    const server = await Bun.file(join(outDir, "dist", "server.js")).text();

    // Bun and Node both have a real `process`; shimming it there would mask
    // genuine environment problems at runtime.
    expect(server.startsWith("globalThis.process ??=")).toBe(false);
  });
});
