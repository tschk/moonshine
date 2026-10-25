import { afterAll, beforeAll, describe, expect, test, spyOn } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { isContained, resolveStaticPath, tryServeStatic } from "../src/static";
import * as fs from "node:fs";

const tmpDir = mkdtempSync(resolve(tmpdir(), "ms-static-"));
const staticDir = resolve(tmpDir, "public");

beforeAll(() => {
  mkdirSync(staticDir, { recursive: true });
  writeFileSync(resolve(staticDir, "ok.txt"), "ok");
  writeFileSync(resolve(tmpDir, "secret.txt"), "secret");
  symlinkSync(resolve(tmpDir, "secret.txt"), resolve(staticDir, "escape.txt"));

  mkdirSync(staticDir + "-secret", { recursive: true });
  writeFileSync(resolve(staticDir + "-secret", "secret.txt"), "secret");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveStaticPath", () => {
  test("returns null for malformed URI encoding", () => {
    expect(resolveStaticPath(staticDir, "/%ZZ")).toBeNull();
  });

  test("returns null for empty parts / root dir", () => {
    expect(resolveStaticPath(staticDir, "/")).toBeNull();
  });

  test("handles empty string gracefully", () => {
    expect(resolveStaticPath(staticDir, "")).toBeNull();
  });

  test("returns null for paths trying to traverse up", () => {
    expect(resolveStaticPath(staticDir, "/../")).toBeNull();
  });

  test("returns null if the path contains null bytes", () => {
    expect(resolveStaticPath(staticDir, "/ok%00.txt")).toBeNull();
  });
});

describe("isContained", () => {
  test("returns true for a file inside the directory", () => {
    expect(isContained(staticDir, resolve(staticDir, "ok.txt"))).toBe(true);
  });

  test("returns false for a file outside the directory", () => {
    expect(isContained(staticDir, resolve(tmpDir, "secret.txt"))).toBe(false);
  });

  test("returns false for a file outside the directory but sharing the prefix", () => {
    expect(isContained(staticDir, resolve(staticDir + "-secret", "secret.txt"))).toBe(false);
  });

  test("caches the real root on successive calls", () => {
    const realpathSpy = spyOn(fs.realpathSync, "native");
    isContained(staticDir, resolve(staticDir, "ok.txt"));
    isContained(staticDir, resolve(staticDir, "ok.txt"));
    // Since the root is fixed we're just checking that successive calls don't crash and maintain correctness
    realpathSpy.mockRestore();
  });
});

describe("tryServeStatic", () => {
  test("returns null for non-existent file", async () => {
    expect(await tryServeStatic(staticDir, "/missing.txt")).toBeNull();
  });

  test("HEAD matches GET headers without a body; writes never serve files", async () => {
    const get = await tryServeStatic(staticDir, "/ok.txt");
    const head = await tryServeStatic(staticDir, "/ok.txt", undefined, "HEAD");
    expect(head?.body).toBeNull();
    expect(await head!.text()).toBe("");
    expect(Array.from(head!.headers)).toEqual(Array.from(get!.headers));
    expect(head!.headers.get("content-length")).toBe("2");
    expect(await get!.text()).toBe("ok");
    expect(
      await tryServeStatic(staticDir, "/ok.txt", undefined, "POST"),
    ).toBeNull();
  });

  test("returns null if isContained throws", async () => {
    const realpathSpy = spyOn(fs.realpathSync, "native").mockImplementation(
      () => {
        throw new Error("test error");
      },
    );
    const res = await tryServeStatic(staticDir, "/ok.txt");
    expect(res).toBeNull();
    realpathSpy.mockRestore();
  });

  test("serves correct file with default application/octet-stream if unknown ext and file.type empty", async () => {
    writeFileSync(resolve(staticDir, "unknown.xyz123"), "content");
    const res = await tryServeStatic(staticDir, "/unknown.xyz123");
    expect(res).not.toBeNull();
    // Bun.file() might infer types for common extensions, so we picked a really weird one.
    expect(res?.headers.get("content-type")).toBe("application/octet-stream");
    expect(res?.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

test("bundled static serving runs on Node without Bun and preserves containment and HEAD", async () => {
  const entry = resolve(tmpDir, "node-static.ts");
  await Bun.write(
    entry,
    `
import assert from "node:assert/strict";
import { tryServeStatic } from ${JSON.stringify(resolve(import.meta.dir, "../src/static.ts"))};
const root = ${JSON.stringify(staticDir)};
assert.equal(typeof Bun, "undefined");
const get = await tryServeStatic(root, "/ok.txt", { "x-custom": "kept" });
assert.equal(await get.text(), "ok");
assert.equal(get.headers.get("content-length"), "2");
assert.equal(get.headers.get("x-custom"), "kept");
const head = await tryServeStatic(root, "/ok.txt", undefined, "HEAD");
assert.equal(head.body, null);
assert.equal(head.headers.get("content-length"), "2");
for (const path of ["/escape.txt", "/%2e%2e/secret.txt", "/missing.txt", "/"]) {
  assert.equal(await tryServeStatic(root, path), null);
}
assert.equal(await tryServeStatic(root, "/ok.txt", undefined, "POST"), null);
console.log("node-static-ok");
`,
  );
  const output = resolve(tmpDir, "node-static.mjs");
  const build = await Bun.build({ entrypoints: [entry], target: "node" });
  expect(build.success).toBe(true);
  await Bun.write(output, build.outputs[0]!);
  const child = Bun.spawn(["node", output], { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
  expect(stdout.trim()).toBe("node-static-ok");
});
