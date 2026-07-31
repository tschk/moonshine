import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

type Manifest = {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function manifestAt(dir: string): Manifest | null {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function publicPackages(): { dir: string; manifest: Manifest }[] {
  const out: { dir: string; manifest: Manifest }[] = [];
  for (const base of ["packages", "components"]) {
    const baseDir = join(root, base);
    const direct = manifestAt(baseDir);
    if (direct && direct.private !== true) {
      out.push({ dir: baseDir, manifest: direct });
      continue;
    }
    if (!existsSync(baseDir)) continue;
    for (const entry of new Bun.Glob("*/package.json").scanSync({
      cwd: baseDir,
    })) {
      const dir = join(baseDir, entry.replace("/package.json", ""));
      const manifest = manifestAt(dir);
      if (manifest && manifest.private !== true) out.push({ dir, manifest });
    }
  }
  return out;
}

/**
 * Dependency-first order so a package is never published before what it needs.
 * Cycles are reported and then broken: npm resolves circular package
 * dependencies at install time, so they do not block publishing.
 */
function topoSort(pkgs: { dir: string; manifest: Manifest }[]) {
  const names = new Set(pkgs.map((p) => p.manifest.name));
  const byName = new Map(pkgs.map((p) => [p.manifest.name, p]));
  const sorted: typeof pkgs = [];
  const seen = new Set<string>();
  const cycles: string[] = [];

  function visit(name: string, stack: string[]) {
    if (seen.has(name)) return;
    if (stack.includes(name)) {
      cycles.push([...stack.slice(stack.indexOf(name)), name].join(" -> "));
      return;
    }
    const pkg = byName.get(name);
    if (!pkg) return;
    const deps = {
      ...(pkg.manifest.dependencies ?? {}),
      ...(pkg.manifest.peerDependencies ?? {}),
    };
    for (const dep of Object.keys(deps)) {
      if (names.has(dep)) visit(dep, [...stack, name]);
    }
    seen.add(name);
    sorted.push(pkg);
  }

  for (const pkg of pkgs) visit(pkg.manifest.name, []);
  if (cycles.length) {
    for (const cycle of [...new Set(cycles)]) {
      console.warn(`warning: dependency cycle ${cycle}`);
    }
  }
  return sorted;
}

async function publishedVersions(name: string): Promise<string[]> {
  const proc = Bun.spawn(["npm", "view", name, "versions", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) return [];
  const raw = await new Response(proc.stdout).text();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [];
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const otpArg = process.argv.find((a) => a.startsWith("--otp="));

  const packages = topoSort(publicPackages());
  console.log(`publish order (${packages.length}):`);
  for (const [i, p] of packages.entries()) {
    console.log(`  ${i + 1}. ${p.manifest.name}@${p.manifest.version}`);
  }

  const blocked = packages.filter((p) =>
    Object.values(p.manifest.dependencies ?? {}).some(
      (r) => r.startsWith("file:") || r.startsWith("workspace:"),
    ),
  );
  if (blocked.length) {
    console.error("\nunpublishable dependency ranges:");
    for (const p of blocked) console.error(`  ${p.manifest.name}`);
    process.exit(1);
  }

  let published = 0;
  let skipped = 0;
  for (const pkg of packages) {
    const { name, version } = pkg.manifest;
    if ((await publishedVersions(name)).includes(version)) {
      console.log(`skip  ${name}@${version} (already on npm)`);
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`would publish  ${name}@${version}`);
      continue;
    }
    const args = ["npm", "publish", "--access", "public"];
    if (otpArg) args.push(otpArg);
    const proc = Bun.spawn(args, {
      cwd: pkg.dir,
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
    if (proc.exitCode !== 0) {
      console.error(`\nfailed to publish ${name}@${version}`);
      process.exit(proc.exitCode ?? 1);
    }
    console.log(`published  ${name}@${version}`);
    published += 1;
  }
  console.log(`\ndone: ${published} published, ${skipped} already current`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
