import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { newCommand } from "../src/new";

const tmp = join(import.meta.dir, "..", "..", "..", ".tmp-cli-new");

function clean() {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

beforeAll(clean);
afterAll(clean);

function chdir(dir: string): () => void {
  const prev = process.cwd();
  process.chdir(dir);
  return () => process.chdir(prev);
}

async function scaffold(name: string, args: string[]): Promise<string> {
  const dir = join(tmp, name);
  if (!existsSync(tmp)) {
    await Bun.write(join(tmp, ".keep"), "");
  }
  const restore = chdir(tmp);
  try {
    await newCommand([name, ...args]);
  } finally {
    restore();
  }
  return dir;
}

function pkgJson(dir: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

describe("moonshine new", () => {
  test("scaffolds default minimal Bun project", async () => {
    const dir = await scaffold("default-bun", []);
    expect(existsSync(join(dir, "src/routes/index.server.ts"))).toBe(true);
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(true);
    const pkg = pkgJson(dir);
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-framework");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-compiler");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-server");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-deploy-bun");
    expect(pkg.dependencies).not.toHaveProperty("react");
    expect(pkg.dependencies).not.toHaveProperty("solid-js");
    expect(pkg.dependencies).not.toHaveProperty("@tschk/crepus-moonshine");
    expect(pkg.dependencies).not.toHaveProperty("@tschk/moonshine-react");
  });

  test("scaffolds --react project with selected adapter", async () => {
    const dir = await scaffold("react-bun", ["--react"]);
    expect(existsSync(join(dir, "src/routes/index.tsx"))).toBe(true);
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(true);
    const pkg = pkgJson(dir);
    expect(pkg.dependencies).toHaveProperty("react");
    expect(pkg.dependencies).toHaveProperty("react-dom");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-react");
    expect(pkg.dependencies).not.toHaveProperty("solid-js");
    expect(pkg.dependencies).not.toHaveProperty("@tschk/crepus-moonshine");
  });

  test("scaffolds --solid project with selected adapter", async () => {
    const dir = await scaffold("solid-bun", ["--solid"]);
    expect(existsSync(join(dir, "src/routes/index.ts"))).toBe(true);
    const pkg = pkgJson(dir);
    expect(pkg.dependencies).toHaveProperty("solid-js");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-solid");
    expect(pkg.dependencies).not.toHaveProperty("react");
    expect(pkg.dependencies).not.toHaveProperty("@tschk/crepus-moonshine");
  });

  test("scaffolds --crepus project with selected adapter", async () => {
    const dir = await scaffold("crepus-bun", ["--crepus"]);
    expect(existsSync(join(dir, "src/routes/index.ts"))).toBe(true);
    const pkg = pkgJson(dir);
    expect(pkg.dependencies).toHaveProperty("@tschk/crepus-moonshine");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-react");
    expect(pkg.dependencies).toHaveProperty("react");
    expect(pkg.dependencies).toHaveProperty("react-dom");
    expect(pkg.dependencies).not.toHaveProperty("solid-js");
    expect(pkg.dependencies).not.toHaveProperty("@tschk/moonshine-solid");
  });

  test("scaffolds all adapter targets", async () => {
    for (const adapter of ["node", "cloudflare", "vercel"] as const) {
      const dir = await scaffold(`adapter-${adapter}`, ["--adapter", adapter]);
      const pkg = pkgJson(dir);
      expect(pkg.dependencies).toHaveProperty(
        `@tschk/moonshine-deploy-${adapter}`,
      );
      expect(pkg.dependencies).not.toHaveProperty(
        "@tschk/moonshine-deploy-bun",
      );
    }
  });

  test("scaffolds --vite with React SPA", async () => {
    const dir = await scaffold("vite-app", ["--vite"]);
    expect(existsSync(join(dir, "src/main.tsx"))).toBe(true);
    expect(existsSync(join(dir, "vite.config.ts"))).toBe(true);
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "src/routes/index.tsx"))).toBe(false);
    expect(existsSync(join(dir, "src/server.ts"))).toBe(false);
    const pkg = pkgJson(dir);
    expect(pkg.dependencies).toHaveProperty("react");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine");
    expect(pkg.devDependencies).toHaveProperty("vite");
  });
});
