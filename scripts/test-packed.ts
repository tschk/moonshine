import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { mkdtempSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";

const root = resolve(import.meta.dir, "..");
const packagesDir = join(root, "packages");
const componentsDir = join(root, "components");
const exampleDir = join(root, "examples/hybrid-app");

type PackageInfo = {
  name: string;
  version: string;
  dir: string;
};

function shortName(fullName: string): string {
  return fullName.replace("@tschk/", "");
}

async function collectPublicPackages(): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  for (const dir of [packagesDir, componentsDir]) {
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgDir = join(dir, entry.name);
      const pkgPath = join(pkgDir, "package.json");
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
        name: string;
        version: string;
        private?: boolean;
      };
      if (pkg.private === true) continue;
      packages.push({ name: pkg.name, version: pkg.version, dir: pkgDir });
    }
  }
  return packages;
}

async function packPackage(
  pkg: PackageInfo,
  tarballsDir: string,
): Promise<string> {
  const staging = mkdtempSync(join(tarballsDir, `${shortName(pkg.name)}-`));
  const entries = await readdir(pkg.dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      ["node_modules", ".moonshine", "dist", ".tmp", ".turbo"].includes(
        entry.name,
      )
    )
      continue;
    cpSync(join(pkg.dir, entry.name), join(staging, entry.name), {
      recursive: true,
    });
  }

  const pkgJsonPath = join(staging, "package.json");
  let text = await readFile(pkgJsonPath, "utf8");
  text = text.replace(/"workspace:\*"/g, '"^0.2.0"');
  text = text.replace(/"file:[^"]*"/g, '"^0.2.0"');
  await writeFile(pkgJsonPath, text);

  const proc = Bun.spawn(["bun", "pm", "pack"], {
    cwd: staging,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`pack failed for ${pkg.name}: ${err}`);
  }

  const tgz = (await readdir(staging)).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error(`tarball not found for ${pkg.name}`);
  const target = join(tarballsDir, `${shortName(pkg.name)}.tgz`);
  cpSync(join(staging, tgz), target);
  rmSync(staging, { recursive: true, force: true });
  return target;
}

async function extractTarball(tgz: string, target: string) {
  await mkdir(target, { recursive: true });
  const proc = Bun.spawn(
    ["tar", "-xzf", tgz, "-C", target, "--strip-components=1"],
    { stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`extract failed for ${basename(tgz)}: ${err}`);
  }
}

async function installMoonshineTarballs(
  projectDir: string,
  tarballs: Map<string, string>,
) {
  const scoped = join(projectDir, "node_modules", "@tschk");
  await mkdir(scoped, { recursive: true });
  for (const [name, tgz] of tarballs) {
    const target = join(scoped, shortName(name));
    await extractTarball(tgz, target);
  }
}

async function runInstall(projectDir: string) {
  const proc = Bun.spawn(["bun", "install"], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`bun install failed: ${err}`);
  }
}

async function runBuild(projectDir: string, adapter: string) {
  const cli = join(
    projectDir,
    "node_modules/@tschk/moonshine-cli/bin/moonshine.ts",
  );
  const proc = Bun.spawn(["bun", cli, "build", "--adapter", adapter], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    const out = await new Response(proc.stdout).text();
    throw new Error(`moonshine build ${adapter} failed: ${err}\n${out}`);
  }
}

type ServerProcess = {
  url: URL;
  stop: () => Promise<void>;
};

async function runPreview(projectDir: string): Promise<ServerProcess> {
  const cli = join(
    projectDir,
    "node_modules/@tschk/moonshine-cli/bin/moonshine.ts",
  );
  const proc = Bun.spawn(["bun", cli, "preview", "--port", "0"], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const match = text.match(/http:\/\/localhost:(\d+)\//);
    if (match) {
      return {
        url: new URL(`http://localhost:${match[1]}/`),
        stop: async () => {
          proc.kill(15);
          await proc.exited;
        },
      };
    }
  }
  proc.kill(15);
  await proc.exited;
  throw new Error("moonshine preview did not log a URL");
}

async function runNodeServer(projectDir: string): Promise<ServerProcess> {
  const server = join(projectDir, ".moonshine/server.ts");
  const proc = Bun.spawn(["bun", server], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const match = text.match(/http:\/\/localhost:(\d+)\//);
    if (match) {
      return {
        url: new URL(`http://localhost:${match[1]}/`),
        stop: async () => {
          proc.kill(15);
          await proc.exited;
        },
      };
    }
  }
  proc.kill(15);
  await proc.exited;
  throw new Error("node server did not log a URL");
}

async function assertRoute(
  base: URL,
  path: string,
  checks: {
    status: number;
    contains?: string[];
    notContains?: string[];
    contentType?: string;
    json?: Record<string, unknown>;
  },
) {
  const res = await fetch(new URL(path, base));
  if (res.status !== checks.status) {
    throw new Error(`${path}: expected ${checks.status}, got ${res.status}`);
  }
  if (checks.contentType) {
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes(checks.contentType)) {
      throw new Error(
        `${path}: expected content-type ${checks.contentType}, got ${ct}`,
      );
    }
  }
  const text = checks.contains || checks.notContains ? await res.text() : "";
  for (const s of checks.contains ?? []) {
    if (!text.includes(s))
      throw new Error(`${path}: missing ${JSON.stringify(s)}`);
  }
  for (const s of checks.notContains ?? []) {
    if (text.includes(s))
      throw new Error(`${path}: should not contain ${JSON.stringify(s)}`);
  }
  if (checks.json) {
    const body = (await res.json()) as Record<string, unknown>;
    for (const [k, v] of Object.entries(checks.json)) {
      if (body[k] !== v)
        throw new Error(`${path}: expected ${k}=${v}, got ${body[k]}`);
    }
  }
}

async function assertFiveModes(base: URL) {
  await assertRoute(base, "/", {
    status: 200,
    contains: ["<h1>home</h1>"],
    notContains: ["<script"],
  });
  await assertRoute(base, "/counter", {
    status: 200,
    contains: ["<h1>counter</h1>", "<button", "<script"],
  });
  await assertRoute(base, "/account/42", {
    status: 200,
    contains: ["account", ">42</p>"],
  });
  await assertRoute(base, "/dashboard/foo/bar", {
    status: 200,
    contains: ['id="moonshine-app"', "<script"],
  });
  await assertRoute(base, "/api/health", {
    status: 200,
    contentType: "application/json",
    json: { status: "ok" },
  });
}

async function createProject(
  tmp: string,
  tarballs: Map<string, string>,
): Promise<string> {
  const projectDir = join(tmp, "project");
  await mkdir(projectDir, { recursive: true });
  await cp(join(exampleDir, "src"), join(projectDir, "src"), {
    recursive: true,
  });
  await cp(
    join(exampleDir, "tsconfig.json"),
    join(projectDir, "tsconfig.json"),
  );

  const pkgJson = {
    name: "moonshine-hybrid-app-packed",
    type: "module",
    version: "0.0.0",
    dependencies: {
      react: "19.1.0",
      "react-dom": "19.1.0",
      typescript: "^5.8.2",
    },
    devDependencies: {
      "@types/bun": "1.3.14",
      "@types/react": "^19.1.0",
      "@types/react-dom": "^19.1.0",
    },
  };
  await writeFile(
    join(projectDir, "package.json"),
    JSON.stringify(pkgJson, null, 2) + "\n",
  );
  await runInstall(projectDir);

  const pkgText = await readFile(join(projectDir, "package.json"), "utf8");
  if (pkgText.includes("workspace:") || pkgText.includes("file:")) {
    throw new Error(
      "temp project package.json must not contain workspace or file references",
    );
  }

  await installMoonshineTarballs(projectDir, tarballs);
  return projectDir;
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "moonshine-packed-"));
  try {
    const tarballsDir = join(tmp, "tarballs");
    await mkdir(tarballsDir, { recursive: true });

    const packages = await collectPublicPackages();
    const tarballs = new Map<string, string>();
    for (const pkg of packages) {
      const tgz = await packPackage(pkg, tarballsDir);
      tarballs.set(pkg.name, tgz);
    }

    console.log(`packed ${tarballs.size} packages`);

    const projectDir = await createProject(tmp, tarballs);
    console.log(`created temp project: ${projectDir}`);

    await runBuild(projectDir, "bun");
    console.log("built with bun adapter");

    const bun = await runPreview(projectDir);
    console.log(`bun preview: ${bun.url}`);
    await assertFiveModes(bun.url);
    console.log("bun preview served all five modes");
    await bun.stop();

    await runBuild(projectDir, "node");
    console.log("built with node adapter");

    const node = await runNodeServer(projectDir);
    console.log(`node preview: ${node.url}`);
    await assertFiveModes(node.url);
    console.log("node preview served all five modes");
    await node.stop();

    console.log("packed test passed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
