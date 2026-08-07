/** The changes adoption would make, and applying them. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { adapterFor, templateGlobs } from "./frameworks.js";
import type { AdoptChange, AdoptPlan, AdoptScan, Framework } from "./types.js";
import { RUNTIME_DEPS, readJson, toPosix } from "./scan.js";
import { planTemplateRoutes } from "./templates.js";
import { scanProject } from "./project.js";
import { detectMoonshineRoot, packagePath } from "../new.js";

/**
 * Where the project will find `@tschk/moonshine-next` on disk. Only installed
 * `node_modules` trees count: adopt normally runs before `bun install`, and
 * `Bun.resolveSync` would then answer with whatever version happens to sit in
 * the global module cache — a copy that can predate the adapter's current
 * surface, leaving specifiers pointing at files that do not exist.
 */
function adapterDir(projectDir: string, pkg: string): string {
  const parts = pkg.split("/");
  let dir = projectDir;
  for (;;) {
    const candidate = join(dir, "node_modules", ...parts);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(projectDir, "node_modules", ...parts);
}

/**
 * `compilerOptions.paths` entries pointing every aliasable `next/*` specifier
 * at a real file. Bun applies tsconfig paths in both `bun run` and `Bun.build`,
 * but only for relative targets — a bare package specifier is not remapped.
 */
export function aliasPaths(
  projectDir: string,
  framework: Framework = "next-app",
): Record<string, string[]> {
  const adapter = adapterFor(framework);
  if (!adapter) return {};
  const pkgDir = adapterDir(projectDir, adapter.pkg);
  const srcDir = dirname(adapter.resolveAlias(adapter.reference)!);
  const paths: Record<string, string[]> = {};
  for (const specifier of Object.keys(adapter.aliases)) {
    const source = adapter.resolveAlias(specifier);
    if (!source) continue;
    const file = join(pkgDir, "src", relative(srcDir, source));
    const rel = toPosix(relative(projectDir, file));
    paths[specifier] = [rel.startsWith(".") ? rel : `./${rel}`];
  }
  return paths;
}

function planTsconfig(scan: AdoptScan): AdoptChange {
  const path = join(scan.projectDir, "tsconfig.json");
  const existing =
    readJson<{ compilerOptions?: Record<string, unknown> }>(path) ?? {};
  const compilerOptions = { ...existing.compilerOptions };
  const previous = (compilerOptions.paths ?? {}) as Record<string, string[]>;
  const wanted = aliasPaths(scan.projectDir, scan.framework);
  const paths = { ...previous, ...wanted };
  compilerOptions.baseUrl = compilerOptions.baseUrl ?? ".";
  compilerOptions.jsx = compilerOptions.jsx ?? "react-jsx";
  compilerOptions.paths = paths;

  const alreadyApplied = Object.entries(wanted).every(
    ([key, value]) => previous[key]?.[0] === value[0],
  );
  const adapter = adapterFor(scan.framework);
  const added = Object.entries(wanted).filter(
    ([key, value]) => previous[key]?.[0] !== value[0],
  );
  const details: string[] = [];
  if (existing.compilerOptions?.baseUrl === undefined) {
    details.push(`compilerOptions.baseUrl = "."`);
  }
  if (existing.compilerOptions?.jsx === undefined) {
    details.push(`compilerOptions.jsx = "react-jsx"`);
  }
  for (const [key, value] of added) {
    details.push(`compilerOptions.paths["${key}"] = "${value[0]}"`);
  }

  return {
    file: "tsconfig.json",
    action: existsSync(path) ? "modify" : "create",
    details,
    summary: !adapter
      ? "baseUrl and jsx set; this framework needs no import aliases"
      : alreadyApplied
        ? `already aliases ${Object.keys(wanted).length} specifiers`
        : `aliases ${Object.keys(wanted).length} specifiers to ${adapter.pkg}`,
    alreadyApplied,
    contents: JSON.stringify({ ...existing, compilerOptions }, null, 2) + "\n",
  };
}

function planConfig(scan: AdoptScan, force: boolean): AdoptChange {
  const path = join(scan.projectDir, "moonshine.config.ts");
  const exists = existsSync(path);
  const entries: Record<string, unknown> = {
    runtime: "bun",
    adapter: "bun",
    renderer: "react",
    ...(scan.routesDir && { routesDir: scan.routesDir }),
    ...(scan.convention && { convention: scan.convention }),
  };
  const contents = `import { defineConfig } from "@tschk/moonshine-framework";

export default defineConfig(${JSON.stringify(entries, null, 2)});
`;
  const current = exists ? readFileSync(path, "utf8") : "";
  const alreadyApplied = exists && (current === contents || !force);
  return {
    file: "moonshine.config.ts",
    action: alreadyApplied ? "none" : exists ? "modify" : "create",
    details: alreadyApplied
      ? []
      : Object.entries(entries).map(
          ([key, value]) => `defineConfig.${key} = ${JSON.stringify(value)}`,
        ),
    summary: alreadyApplied
      ? "already present, left untouched"
      : `${exists ? "rewritten" : "created"} (routesDir ${scan.routesDir ?? "src/routes"}, convention ${scan.convention ?? "moonshine"})`,
    alreadyApplied,
    ...(alreadyApplied ? {} : { contents }),
  };
}

function planPackageJson(scan: AdoptScan): AdoptChange {
  const path = join(scan.projectDir, "package.json");
  const pkg =
    readJson<{
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    }>(path) ?? {};
  const root = detectMoonshineRoot();
  const version = `^${cliVersion()}`;

  const dependencies = { ...pkg.dependencies };
  const added: string[] = [];
  const adapter = adapterFor(scan.framework);
  const template = templateGlobs(scan.framework) !== undefined;
  for (const name of [
    ...RUNTIME_DEPS,
    ...(adapter ? [adapter.pkg] : []),
    ...(template ? ["@tschk/crepus-moonshine"] : []),
  ] as string[]) {
    if (dependencies[name]) continue;
    const spec = packagePath(name, root, version);
    if (!spec) continue;
    dependencies[name] = spec;
    added.push(name);
  }

  const scripts = { ...pkg.scripts };
  const repointed: string[] = [];
  const mapping: Record<string, string> = {
    dev: "moonshine dev",
    build: "moonshine build",
    start: "moonshine preview",
  };
  for (const [key, value] of Object.entries(mapping)) {
    const current = scripts[key];
    if (
      current !== undefined &&
      !/^(next|vite|remix|react-router|waku)(\s|$)/.test(current)
    ) {
      continue;
    }
    if (current === value) continue;
    scripts[key] = value;
    repointed.push(key);
  }

  const alreadyApplied = added.length === 0 && repointed.length === 0;
  const parts: string[] = [];
  if (added.length) parts.push(`+${added.length} dependencies`);
  if (repointed.length)
    parts.push(`scripts ${repointed.join(", ")} → moonshine`);

  return {
    file: "package.json",
    action: existsSync(path) ? "modify" : "create",
    details: [
      ...added.map(
        (name) => `dependencies["${name}"] = "${dependencies[name]}"`,
      ),
      ...repointed.map((key) => `scripts["${key}"] = "${scripts[key]}"`),
    ],
    summary: alreadyApplied ? "already adopted" : parts.join(", "),
    alreadyApplied,
    contents: JSON.stringify({ ...pkg, dependencies, scripts }, null, 2) + "\n",
  };
}

function cliVersion(): string {
  const pkg = readJson<{ version?: string }>(
    join(import.meta.dir, "..", "package.json"),
  );
  return pkg?.version ?? "0.3.2";
}

export async function planAdoption(
  projectDir: string,
  options: { force?: boolean } = {},
): Promise<AdoptPlan> {
  const scan = await scanProject(projectDir);
  return {
    scan,
    changes: [
      planTsconfig(scan),
      planConfig(scan, options.force ?? false),
      planPackageJson(scan),
      ...planTemplateRoutes(scan),
    ],
    // Aliasing covers every specifier the adapter implements, so nothing in the
    // user's source is edited. Unaliasable specifiers are reported, not rewritten,
    // because there is no moonshine implementation to rewrite them to.
    rewritten: [],
  };
}

export function applyPlan(plan: AdoptPlan): void {
  for (const change of plan.changes) {
    if (change.contents === undefined) continue;
    const path = join(plan.scan.projectDir, change.file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, change.contents);
  }
}
