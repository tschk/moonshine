import { describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { newCommand } from "../src/new";

const tmp = join(import.meta.dir, "..", "..", "..", ".tmp-cli-new");

function clean() {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

describe("moonshine new", () => {
  test("scaffolds bun stack by default", async () => {
    clean();
    const dir = join(tmp, "bun-app");
    const prev = process.cwd();
    try {
      // parent must exist for resolve
      await Bun.write(join(tmp, ".keep"), "");
      process.chdir(tmp);
      await newCommand(["bun-app"]);
      expect(existsSync(join(dir, "src/server.ts"))).toBe(true);
      expect(existsSync(join(dir, "src/client.tsx"))).toBe(true);
      expect(existsSync(join(dir, "public/app.css"))).toBe(true);
      const pkg = await Bun.file(join(dir, "package.json")).json();
      expect(pkg.scripts.dev).toContain("build:client");
    } finally {
      process.chdir(prev);
      clean();
    }
  });

  test("scaffolds vite stack with --vite", async () => {
    clean();
    const dir = join(tmp, "vite-app");
    const prev = process.cwd();
    try {
      await Bun.write(join(tmp, ".keep"), "");
      process.chdir(tmp);
      await newCommand(["vite-app", "--vite"]);
      expect(existsSync(join(dir, "src/main.tsx"))).toBe(true);
      expect(existsSync(join(dir, "vite.config.ts"))).toBe(true);
      expect(existsSync(join(dir, "src/server.ts"))).toBe(false);
    } finally {
      process.chdir(prev);
      clean();
    }
  });
});
