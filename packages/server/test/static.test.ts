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
import {
  isContained,
  resolveStaticPath,
  staticFileHeaders,
  tryServeStatic,
} from "../src/static";
import * as fs from "node:fs";

const tmpDir = mkdtempSync(resolve(tmpdir(), "ms-static-"));
const staticDir = resolve(tmpDir, "public");

beforeAll(() => {
  mkdirSync(staticDir, { recursive: true });
  writeFileSync(resolve(staticDir, "ok.txt"), "ok");
  writeFileSync(resolve(tmpDir, "secret.txt"), "secret");
  symlinkSync(resolve(tmpDir, "secret.txt"), resolve(staticDir, "escape.txt"));
  symlinkSync(resolve(staticDir, "ok.txt"), resolve(tmpDir, "link-in.txt"));
  symlinkSync(staticDir, resolve(tmpDir, "public-link"));
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

describe("staticFileHeaders", () => {
  test("sets content-type and default security headers", () => {
    const headers = staticFileHeaders("text/html");
    expect(headers.get("content-type")).toBe("text/html");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("initializes with custom headers", () => {
    const headers = staticFileHeaders("text/css", { "x-custom": "value" });
    expect(headers.get("content-type")).toBe("text/css");
    expect(headers.get("x-custom")).toBe("value");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });

  test("does not overwrite provided custom security headers", () => {
    const headers = staticFileHeaders("application/json", {
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "custom",
    });
    expect(headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("x-content-type-options")).toBe("custom");
  });

  test("overwrites content-type even if provided in customHeaders", () => {
    const headers = staticFileHeaders("text/javascript", {
      "content-type": "text/plain",
    });
    expect(headers.get("content-type")).toBe("text/javascript");
  });
});

describe("isContained", () => {
  test("returns true for a file inside the directory", () => {
    expect(isContained(staticDir, resolve(staticDir, "ok.txt"))).toBe(true);
  });

  test("returns false for a file outside the directory", () => {
    expect(isContained(staticDir, resolve(tmpDir, "secret.txt"))).toBe(false);
  });

  test("caches the real root on successive calls", () => {
    const realpathSpy = spyOn(fs.realpathSync, "native");

    const newDir = resolve(tmpDir, "newdir");
    mkdirSync(newDir, { recursive: true });
    writeFileSync(resolve(newDir, "a.txt"), "a");

    realpathSpy.mockClear();
    isContained(newDir, resolve(newDir, "a.txt"));
    expect(realpathSpy).toHaveBeenCalledTimes(2); // root + file

    realpathSpy.mockClear();
    isContained(newDir, resolve(newDir, "a.txt"));
    expect(realpathSpy).toHaveBeenCalledTimes(1); // only file, root is cached

    realpathSpy.mockRestore();
  });

  test("returns false for a symlink escaping the directory", () => {
    expect(isContained(staticDir, resolve(staticDir, "escape.txt"))).toBe(
      false,
    );
  });

  test("returns true for the root directory itself", () => {
    expect(isContained(staticDir, staticDir)).toBe(true);
  });

  test("returns false for a path sharing a string prefix but not contained", () => {
    const similarDir = staticDir + "-other";
    mkdirSync(similarDir, { recursive: true });
    writeFileSync(resolve(similarDir, "file.txt"), "content");
    try {
      expect(isContained(staticDir, resolve(similarDir, "file.txt"))).toBe(
        false,
      );
    } finally {
      rmSync(similarDir, { recursive: true, force: true });
    }
  });

  test("throws an error if the file does not exist", () => {
    expect(() =>
      isContained(staticDir, resolve(staticDir, "missing.txt")),
    ).toThrow();
  });

  test("returns true when a symlink outside points inside", () => {
    expect(isContained(staticDir, resolve(tmpDir, "link-in.txt"))).toBe(true);
  });

  test("works correctly when the root itself is a symlink", () => {
    const symlinkRoot = resolve(tmpDir, "public-link");
    expect(isContained(symlinkRoot, resolve(symlinkRoot, "ok.txt"))).toBe(true);
    expect(isContained(symlinkRoot, resolve(symlinkRoot, "escape.txt"))).toBe(
      false,
    );
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
