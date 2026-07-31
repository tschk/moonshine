import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function exec(command: string[], options?: { cwd?: string }) {
  const proc = Bun.spawn(command, {
    cwd: options?.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  return { code: proc.exitCode ?? 1, out, err };
}

type PackageInfo = {
  name: string;
  version: string;
  dir: string;
  path: string;
  private?: boolean;
};

async function collectPublicPackages(): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  for (const base of [join(root, "packages"), join(root, "components")]) {
    if (!existsSync(base)) continue;
    const basePkg = join(base, "package.json");
    if (existsSync(basePkg)) {
      const pkg = JSON.parse(readFileSync(basePkg, "utf8")) as {
        name: string;
        version: string;
        private?: boolean;
      };
      if (pkg.private !== true) {
        packages.push({
          name: pkg.name,
          version: pkg.version,
          dir: base,
          path: basePkg,
          private: pkg.private,
        });
      }
    }
    const entries = await readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(base, entry.name);
      const pkgPath = join(dir, "package.json");
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name: string;
        version: string;
        private?: boolean;
      };
      if (pkg.private === true) continue;
      packages.push({
        name: pkg.name,
        version: pkg.version,
        dir,
        path: pkgPath,
        private: pkg.private,
      });
    }
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

async function checkBranch() {
  const current = await exec(["git", "branch", "--show-current"], {
    cwd: root,
  });
  const branch = current.out.trim();
  if (branch !== "main") {
    fail(`must be on main branch (currently on ${branch})`);
  }
  const upstream = await exec(
    ["git", "for-each-ref", "--format=%(upstream:short)", "refs/heads/main"],
    { cwd: root },
  );
  if (upstream.out.trim() !== "origin/main") {
    fail(
      `main must track origin/main (tracking ${upstream.out.trim() || "nothing"})`,
    );
  }
}

async function checkGitStatus() {
  const status = await exec(["git", "status", "--porcelain"], { cwd: root });
  const allowed = [
    /^package\.json$/,
    /^packages\/[^/]+\/package\.json$/,
    /^components\/package\.json$/,
    /^bun\.lock$/,
    /^CHANGELOG\.md$/,
    /^scripts\/release\.ts$/,
    /^docs\/audits\/0\.3\.0-framework-audit\.md$/,
  ];
  const unexpected: string[] = [];
  for (const line of status.out.split("\n")) {
    if (!line.trim()) continue;
    const path = line.slice(3).trim();
    if (allowed.some((pattern) => pattern.test(path))) continue;
    unexpected.push(path);
  }
  if (unexpected.length) {
    fail(
      `git status has unexpected changes:\n${unexpected.map((p) => `  ${p}`).join("\n")}`,
    );
  }
}

async function checkVersions(packages: PackageInfo[], target: string) {
  const bad = packages.filter((p) => p.version !== target);
  if (bad.length) {
    fail(
      `packages still at ${bad[0].version} (expected ${target}):\n${bad.map((p) => `  ${p.name}`).join("\n")}`,
    );
  }
}

async function checkDependencyRanges(packages: PackageInfo[], target: string) {
  const expected = `^${target}`;
  const bad: string[] = [];
  for (const pkg of packages) {
    const manifest = JSON.parse(readFileSync(pkg.path, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ] as const) {
      const deps = manifest[field];
      if (!deps) continue;
      for (const [name, range] of Object.entries(deps)) {
        if (!name.startsWith("@tschk/")) continue;
        if (range !== expected) {
          bad.push(`${pkg.name} ${field}.${name}: ${range}`);
        }
      }
    }
  }
  if (bad.length) {
    fail(`internal dependency ranges must be ${expected}:\n${bad.join("\n")}`);
  }
}

async function checkPackedManifests(packages: PackageInfo[]) {
  const tmp = mkdtempSync(join(tmpdir(), "moonshine-release-"));
  try {
    for (const pkg of packages) {
      const pack = await exec(["bun", "pm", "pack", "--destination", tmp], {
        cwd: pkg.dir,
      });
      if (pack.code !== 0) {
        fail(`pack failed for ${pkg.name}: ${pack.err || pack.out}`);
      }
      const tgz = (await readdir(tmp)).find((f) => f.endsWith(".tgz"));
      if (!tgz) fail(`tarball not found for ${pkg.name}`);
      const tar = await exec([
        "tar",
        "-xOzf",
        join(tmp, tgz),
        "package/package.json",
      ]);
      if (tar.code !== 0) {
        fail(`tarball inspect failed for ${pkg.name}: ${tar.err || tar.out}`);
      }
      const packed = JSON.parse(tar.out) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ] as const) {
        const deps = packed[field];
        if (!deps) continue;
        for (const [name, range] of Object.entries(deps)) {
          if (range.startsWith("workspace:") || range.startsWith("file:")) {
            fail(
              `packed manifest for ${pkg.name} contains ${field}.${name}: ${range}`,
            );
          }
        }
      }
      rmSync(join(tmp, tgz), { force: true });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function checkNpmAuth(packages: PackageInfo[]) {
  const warnings: string[] = [];
  const whoami = await exec(["bunx", "npm", "whoami"]);
  if (whoami.code !== 0) {
    warnings.push(
      `npm identity not available: ${whoami.err || whoami.out || whoami.code}`,
    );
  } else {
    const user = whoami.out.trim();
    for (const pkg of packages) {
      const view = await exec([
        "bunx",
        "npm",
        "view",
        pkg.name,
        "maintainers",
        "--json",
      ]);
      if (view.code !== 0) {
        warnings.push(
          `could not verify maintainers for ${pkg.name}: ${view.err || view.out || view.code}`,
        );
        continue;
      }
      let maintainers: string[];
      try {
        maintainers = JSON.parse(view.out) as string[];
      } catch {
        warnings.push(`could not parse maintainers for ${pkg.name}`);
        continue;
      }
      const names = maintainers.map((m) => m.split(" ")[0]);
      if (!names.includes(user)) {
        warnings.push(`npm user ${user} is not a maintainer of ${pkg.name}`);
      }
    }
  }
  return warnings;
}

async function main() {
  const mode = process.argv[2];
  const target = process.argv[3];
  if (mode !== "--check" || !target) {
    fail("usage: bun scripts/release.ts --check <version>");
  }

  const packages = await collectPublicPackages();

  await checkBranch();
  await checkGitStatus();
  await checkVersions(packages, target);
  await checkDependencyRanges(packages, target);
  await checkPackedManifests(packages);

  const warnings = await checkNpmAuth(packages);
  if (warnings.length) {
    for (const w of warnings) console.warn(`warning: ${w}`);
    console.log(
      `release check passed with ${warnings.length} npm auth/ownership warning(s)`,
    );
  } else {
    console.log(`release check passed for ${target}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
