import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { newCommand, detectMoonshineRoot } from "../src/new";

const tmp = join(import.meta.dir, "..", "..", "..", ".tmp-cli-new");

function clean() {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

beforeAll(clean);
afterAll(clean);

function chdir(dir: string): () => void {
  const prev = process.cwd.bind(process);
  process.cwd = () => dir;
  return () => {
    process.cwd = prev;
  };
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

describe("detectMoonshineRoot", () => {
  test("respects MOONSHINE_PATH environment variable", () => {
    const oldEnv = process.env.MOONSHINE_PATH;
    const tmpPath = resolve(mkdtempSync(join(tmpdir(), "moonshine-mock-env-")));
    process.env.MOONSHINE_PATH = tmpPath;
    try {
      expect(detectMoonshineRoot()).toBe(tmpPath);
    } finally {
      if (oldEnv === undefined) {
        delete process.env.MOONSHINE_PATH;
      } else {
        process.env.MOONSHINE_PATH = oldEnv;
      }
      rmSync(tmpPath, { recursive: true, force: true });
    }
  });

  test("finds root traversing upwards", () => {
    const rootPath = resolve(
      mkdtempSync(join(tmpdir(), "moonshine-mock-root-")),
    );
    mkdirSync(join(rootPath, "packages", "core"), { recursive: true });
    mkdirSync(join(rootPath, "packages", "cli"), { recursive: true });
    writeFileSync(join(rootPath, "packages", "core", "package.json"), "{}");
    writeFileSync(join(rootPath, "packages", "cli", "package.json"), "{}");

    const deepPath = join(rootPath, "a", "b", "c", "d");
    mkdirSync(deepPath, { recursive: true });

    const restore = chdir(deepPath);
    try {
      expect(detectMoonshineRoot()).toBe(rootPath);
    } finally {
      restore();
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  test("returns null if not found within 8 levels", () => {
    const rootPath = resolve(
      mkdtempSync(join(tmpdir(), "moonshine-mock-null-")),
    );
    mkdirSync(join(rootPath, "packages", "core"), { recursive: true });
    mkdirSync(join(rootPath, "packages", "cli"), { recursive: true });
    writeFileSync(join(rootPath, "packages", "core", "package.json"), "{}");
    writeFileSync(join(rootPath, "packages", "cli", "package.json"), "{}");

    // 9 levels deep
    const deepPath = join(
      rootPath,
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    );
    mkdirSync(deepPath, { recursive: true });

    const restore = chdir(deepPath);
    try {
      expect(detectMoonshineRoot()).toBeNull();
    } finally {
      restore();
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
});

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
