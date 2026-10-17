import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bunAdapter } from "@tschk/moonshine-deploy-bun";
import { buildProjectIsolated } from "../../compiler/test/build-in-subprocess";
import { startPreview } from "../src/preview";
import { startNativeArtifact } from "../../deploy-bun/test/native-fixture";
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
  scripts?: Record<string, string>;
  overrides?: Record<string, string>;
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
    // detectMoonshineRoot short-circuits on MOONSHINE_PATH, so the traversal
    // tests must not observe a value inherited from the developer's shell.
    const oldEnv = process.env.MOONSHINE_PATH;
    delete process.env.MOONSHINE_PATH;
    try {
      expect(detectMoonshineRoot()).toBe(rootPath);
    } finally {
      if (oldEnv === undefined) {
        delete process.env.MOONSHINE_PATH;
      } else {
        process.env.MOONSHINE_PATH = oldEnv;
      }
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
    // See above: traversal must not observe an inherited MOONSHINE_PATH.
    const oldEnv = process.env.MOONSHINE_PATH;
    delete process.env.MOONSHINE_PATH;
    try {
      expect(detectMoonshineRoot()).toBeNull();
    } finally {
      if (oldEnv === undefined) {
        delete process.env.MOONSHINE_PATH;
      } else {
        process.env.MOONSHINE_PATH = oldEnv;
      }
      restore();
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
});

describe("moonshine new", () => {
  test("scaffolds default minimal Bun project", async () => {
    const dir = await scaffold("default-bun", []);
    expect(existsSync(join(dir, "src/routes/home.ts"))).toBe(true);
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(true);
    const pkg = pkgJson(dir);
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-dom");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-framework");
    expect(pkg.dependencies).not.toHaveProperty("@tschk/moonshine-compiler");
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-server");
    expect(pkg.devDependencies).toHaveProperty("@tschk/moonshine-cli");
    expect(existsSync(join(dir, "src/client/counter.ts"))).toBe(true);
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

  test("--solid selects the independent native scaffold", async () => {
    const dir = await scaffold("solid-bun", ["--solid"]);
    expect(existsSync(join(dir, "src/routes/home.ts"))).toBe(true);
    expect(existsSync(join(dir, "src/client/counter.ts"))).toBe(true);
    const pkg = pkgJson(dir);
    expect(pkg.dependencies).toHaveProperty("@tschk/moonshine-dom");
    expect(pkg.devDependencies).toHaveProperty("@tschk/moonshine-cli");
    for (const host of [
      "solid-js",
      "@tschk/moonshine-solid",
      "react",
      "@tschk/crepus-moonshine",
    ])
      expect(pkg.dependencies).not.toHaveProperty(host);
    expect(readFileSync(join(dir, "moonshine.config.ts"), "utf8")).toContain(
      '"renderer":"native"',
    );
    expect(
      JSON.parse(readFileSync(join(dir, "tsconfig.json"), "utf8"))
        .compilerOptions,
    ).not.toHaveProperty("jsxImportSource");
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
      const dir = await scaffold(`adapter-${adapter}`, [
        "--react",
        "--adapter",
        adapter,
      ]);
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
    const dir = await scaffold("vite-app", ["--react", "--vite"]);
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

test.each(["--native", "--solid"])(
  "%s scaffold builds and serves SSR and a browser-only counter bundle",
  async (flag) => {
    const dir = await scaffold("native-build-" + flag.slice(2), [flag]);
    // Resolve installed workspace sources without another dependency installation.
    mkdirSync(join(dir, "node_modules/@tschk"), { recursive: true });
    symlinkSync(
      resolve(import.meta.dir, "../../dom"),
      join(dir, "node_modules/@tschk/moonshine-dom"),
    );
    const config = await import(join(dir, "moonshine.config.ts"));
    await buildProjectIsolated({
      projectDir: dir,
      renderer: config.default.renderer,
      programmatic: config.default.routes,
    });
    const buildDir = join(dir, ".moonshine");
    await bunAdapter.build(
      await Bun.file(join(buildDir, "manifest.json")).json(),
      buildDir,
    );
    const serverEntry = await Bun.file(join(buildDir, "server.ts")).text();
    const dependencies = pkgJson(dir).dependencies!;
    for (const match of serverEntry.matchAll(/from "(@tschk\/[^"/]+)"/g)) {
      expect(dependencies).toHaveProperty(match[1]!);
    }
    const preview = await startPreview({ projectDir: dir });
    try {
      const home = await fetch(new URL("/?name=%3Cguest%3E", preview.url));
      expect(await home.text()).toContain("hello, &lt;guest&gt;");
      const counter = await fetch(new URL("/counter", preview.url));
      const html = await counter.text();
      expect(html).toContain('data-moonshine-app="counter"');
      expect(html).toContain('"start":0');
      const manifest = await Bun.file(
        join(dir, ".moonshine/manifest.json"),
      ).json();
      const route = manifest.routes.find(
        (candidate: { id: string }) => candidate.id === "counter",
      );
      const client = await Bun.file(
        join(dir, ".moonshine/public", route.clientEntries[0]),
      ).text();
      expect(client).not.toContain("searchParams");
      expect(client).not.toContain("react-dom");
      expect(client).not.toContain("solid-js");
    } finally {
      await preview.stop();
    }
  },
  30_000,
);

test("unsupported native targets fail before creating output", async () => {
  for (const flags of [["--crepus", "--vite"]]) {
    const dir = join(tmp, "unsupported");
    const child = Bun.spawn(
      [
        process.execPath,
        resolve(import.meta.dir, "../bin/moonshine.ts"),
        "new",
        dir,
        ...flags,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const error = await new Response(child.stderr).text();
    expect(await child.exited).toBe(1);
    expect(error).toContain(
      flags.includes("--vite")
        ? "supports --native or --react"
        : "support --adapter bun",
    );
    expect(existsSync(dir)).toBe(false);
  }
});

test("default Vite scaffold uses only the independent browser runtime", async () => {
  const dir = await scaffold("native-vite", ["--vite"]);
  const pkg = pkgJson(dir);
  expect(Object.keys(pkg.dependencies!)).toEqual(["@tschk/moonshine-dom"]);
  expect(pkg.devDependencies).not.toHaveProperty("@vitejs/plugin-react");
  expect(readFileSync(join(dir, "index.html"), "utf8")).toContain(
    "/src/main.ts",
  );
  expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toContain(
    "@tschk/moonshine-dom/dom",
  );
});

test("local native scaffolds override the complete package workspace", async () => {
  const root = resolve(import.meta.dir, "../../..");
  const oldEnv = process.env.MOONSHINE_PATH;
  process.env.MOONSHINE_PATH = root;
  try {
    for (const flags of [[], ["--vite"]]) {
      const dir = await scaffold(
        flags.length ? "overrides-vite" : "overrides-bun",
        flags,
      );
      const pkg = pkgJson(dir);
      for (const entry of readdirSync(join(root, "packages"), {
        withFileTypes: true,
      })) {
        const manifest = join(root, "packages", entry.name, "package.json");
        if (!entry.isDirectory() || !existsSync(manifest)) continue;
        const { name } = JSON.parse(readFileSync(manifest, "utf8"));
        expect(pkg.overrides?.[name]).toBe(
          `file:${join(root, "packages", entry.name)}`,
        );
      }
      expect(pkg.dependencies).not.toHaveProperty(
        "@tschk/moonshine-adapter-conformance",
      );
      expect(readFileSync(join(dir, "README.md"), "utf8")).not.toContain(
        "+ hydrate",
      );
    }
  } finally {
    if (oldEnv === undefined) delete process.env.MOONSHINE_PATH;
    else process.env.MOONSHINE_PATH = oldEnv;
  }
});

test("published native scaffold has versioned dependencies and no local overrides", async () => {
  const dir = mkdtempSync(join(tmpdir(), "moonshine-published-new-"));
  const oldEnv = process.env.MOONSHINE_PATH;
  delete process.env.MOONSHINE_PATH;
  const restore = chdir(dir);
  try {
    await newCommand(["app"]);
    const pkg = pkgJson(join(dir, "app"));
    expect(pkg.overrides).toBeUndefined();
    expect(pkg.dependencies?.["@tschk/moonshine-dom"]).toBe("^0.4.2");
    expect(pkg.devDependencies?.["@tschk/moonshine-cli"]).toBe("^0.4.2");
  } finally {
    restore();
    if (oldEnv !== undefined) process.env.MOONSHINE_PATH = oldEnv;
    rmSync(dir, { recursive: true, force: true });
  }
});

test.each(["--native", "--solid"])(
  "%s scaffold production install boots with runtime dependencies",
  async (flag) => {
    const directory = mkdtempSync(join(tmpdir(), "moonshine-new-production-"));
    const root = resolve(import.meta.dir, "../../..");
    const projectDir = join(directory, "app");
    const scaffoldProcess = Bun.spawn(
      [
        process.execPath,
        join(root, "packages/cli/bin/moonshine.ts"),
        "new",
        "app",
        flag,
      ],
      {
        cwd: directory,
        env: { ...process.env, MOONSHINE_PATH: root },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    let server: Awaited<ReturnType<typeof startNativeArtifact>> | undefined;
    try {
      const scaffoldError = await new Response(scaffoldProcess.stderr).text();
      expect(await scaffoldProcess.exited, scaffoldError).toBe(0);
      // Moonshine packages resolve locally; Bun may resolve omitted dev/peer
      // package metadata while creating its production lockfile.
      const install = Bun.spawn(
        [
          process.execPath,
          "install",
          "--production",
          "--ignore-scripts",
          "--cache-dir",
          join(directory, "cache"),
        ],
        { cwd: projectDir, stdout: "pipe", stderr: "pipe" },
      );
      const [installOut, installError, installCode] = await Promise.all([
        new Response(install.stdout).text(),
        new Response(install.stderr).text(),
        install.exited,
      ]);
      expect(installCode, installOut + installError).toBe(0);
      for (const name of [
        "react",
        "react-dom",
        "solid-js",
        "@tschk/moonshine-solid",
        "@tschk/crepuscularity-wasm",
        "@tschk/moonshine-compiler",
        "@tschk/moonshine-cli",
      ]) {
        expect(existsSync(join(projectDir, "node_modules", name))).toBe(false);
      }
      // No host, parser, compiler, or CLI package belongs in production.
      const storePath = join(projectDir, "node_modules/.bun");
      const store = existsSync(storePath) ? readdirSync(storePath) : [];
      for (const entry of store) {
        expect(entry).not.toMatch(
          /^(react|react-dom|solid-js)@|^@tschk\+(crepuscularity-wasm|moonshine-solid|moonshine-compiler|moonshine-cli)@/,
        );
      }
      const build = Bun.spawn(
        [
          process.execPath,
          join(root, "packages/cli/bin/moonshine.ts"),
          "build",
          projectDir,
        ],
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      );
      const [buildOut, buildError, buildCode] = await Promise.all([
        new Response(build.stdout).text(),
        new Response(build.stderr).text(),
        build.exited,
      ]);
      expect(buildCode, buildOut + buildError).toBe(0);
      server = await startNativeArtifact(join(projectDir, ".moonshine"));
      const response = await fetch(new URL("/?name=production", server.url));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("hello, production");
    } finally {
      await server?.stop();
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30_000,
);

test("native Node scaffold uses the independent runtime and Node deployment", async () => {
  const dir = await scaffold("native-node", ["--adapter", "node"]);
  mkdirSync(join(dir, "node_modules/@tschk"), { recursive: true });
  symlinkSync(
    resolve(import.meta.dir, "../../dom"),
    join(dir, "node_modules/@tschk/moonshine-dom"),
  );
  symlinkSync(
    resolve(import.meta.dir, "../../deploy-node"),
    join(dir, "node_modules/@tschk/moonshine-deploy-node"),
  );
  const pkg = pkgJson(dir);
  expect(pkg.dependencies?.["@tschk/moonshine-deploy-node"]).toBeDefined();
  expect(pkg.dependencies?.["@tschk/moonshine-dom"]).toBeDefined();
  expect(pkg.dependencies?.["solid-js"]).toBeUndefined();
  expect(pkg.dependencies?.react).toBeUndefined();
  expect(pkg.scripts?.start).toBe("node .moonshine/server.js");
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../bin/moonshine.ts"),
      "build",
      dir,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, error).toBe(0);
  expect(output).toContain("(node)");
  const mismatch = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../bin/moonshine.ts"),
      "build",
      dir,
      "--adapter",
      "bun",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const mismatchError = await new Response(mismatch.stderr).text();
  expect(await mismatch.exited).toBe(1);
  expect(mismatchError).toContain("matching Bun, Node or Cloudflare runtimes");
  expect(existsSync(join(dir, ".moonshine", "server.js"))).toBe(true);
  const config = readFileSync(join(dir, "moonshine.config.ts"), "utf8");
  expect(config).toContain('"runtime":"node"');
  expect(config).toContain('"adapter":"node"');
}, 30_000);

test("native Cloudflare scaffold builds a portable host-free worker", async () => {
  const dir = await scaffold("native-cloudflare", ["--adapter", "cloudflare"]);
  mkdirSync(join(dir, "node_modules/@tschk"), { recursive: true });
  for (const [name, folder] of [
    ["moonshine-dom", "dom"],
    ["moonshine-deploy-cloudflare", "deploy-cloudflare"],
  ]) {
    symlinkSync(
      resolve(import.meta.dir, `../../${folder}`),
      join(dir, `node_modules/@tschk/${name}`),
    );
  }
  const pkg = pkgJson(dir);
  expect(
    pkg.dependencies?.["@tschk/moonshine-deploy-cloudflare"],
  ).toBeDefined();
  expect(pkg.dependencies?.react).toBeUndefined();
  expect(pkg.dependencies?.["solid-js"]).toBeUndefined();
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../bin/moonshine.ts"),
      "build",
      dir,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, error).toBe(0);
  expect(output).toContain("(cloudflare)");
  const artifact = join(dir, ".moonshine");
  const config = JSON.parse(
    readFileSync(join(artifact, "wrangler.jsonc"), "utf8"),
  );
  expect(config.main).toBe("server.js");
  expect(config.assets.binding).toBe("ASSETS");
  expect(config.compatibility_flags).toContain("nodejs_compat");
  const worker = readFileSync(join(artifact, "server.js"), "utf8");
  expect(worker).not.toContain("react-dom");
  expect(worker).not.toContain("solid-js");
  const manifest = JSON.parse(
    readFileSync(join(artifact, "manifest.json"), "utf8"),
  );
  expect(manifest.routes[0].file).toBe("src/routes/home.ts");
  expect(worker).not.toContain('import("file:');
}, 30_000);

test("native Vercel scaffold uses a bundled Node function and rejects Edge", async () => {
  const dir = await scaffold("native-vercel", ["--adapter", "vercel"]);
  mkdirSync(join(dir, "node_modules/@tschk"), { recursive: true });
  for (const [name, folder] of [
    ["moonshine-dom", "dom"],
    ["moonshine-deploy-vercel", "deploy-vercel"],
  ])
    symlinkSync(
      resolve(import.meta.dir, `../../${folder}`),
      join(dir, `node_modules/@tschk/${name}`),
    );
  const configPath = join(dir, "moonshine.config.ts");
  const config = readFileSync(configPath, "utf8");
  expect(config).toContain('"runtime":"node"');
  const pkg = pkgJson(dir);
  expect(pkg.dependencies?.react).toBeUndefined();
  expect(pkg.dependencies?.["solid-js"]).toBeUndefined();
  const run = () =>
    Bun.spawn(
      [
        process.execPath,
        resolve(import.meta.dir, "../bin/moonshine.ts"),
        "build",
        dir,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
  const child = run();
  const [output, error, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, error).toBe(0);
  expect(output).toContain("(vercel)");
  const functions = join(
    dir,
    ".moonshine/.vercel/output/functions/moonshine.func",
  );
  const functionConfig = JSON.parse(
    readFileSync(join(functions, ".vc-config.json"), "utf8"),
  );
  expect(functionConfig.runtime).toBe("nodejs22.x");
  expect(functionConfig.handler).toBe("index.mjs");
  const bundle = readFileSync(join(functions, "index.mjs"), "utf8");
  expect(bundle).not.toContain("react-dom");
  expect(bundle).not.toContain("solid-js");
  writeFileSync(
    configPath,
    config.replace('"runtime":"node"', '"runtime":"vercel-edge"'),
  );
  const edge = run();
  const edgeError = await new Response(edge.stderr).text();
  await new Response(edge.stdout).text();
  expect(await edge.exited).toBe(1);
  expect(edgeError).toContain("Vercel native functions require Node");
}, 30000);

test("--solid --vite selects the independent browser scaffold", async () => {
  const dir = await scaffold("solid-vite", ["--solid", "--vite"]);
  const pkg = pkgJson(dir);
  expect(Object.keys(pkg.dependencies!)).toEqual(["@tschk/moonshine-dom"]);
  expect(existsSync(join(dir, "src/main.ts"))).toBe(true);
  expect(readFileSync(join(dir, "src/main.ts"), "utf8")).not.toContain(
    "solid-js",
  );
});
