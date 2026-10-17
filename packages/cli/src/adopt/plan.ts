/** The changes adoption would make, and applying them. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { adapterFor, templateGlobs } from "./frameworks.js";
import type { AdoptChange, AdoptPlan, AdoptScan, Framework } from "./types.js";
import { RUNTIME_DEPS, readJson, toPosix } from "./scan.js";
import { planTemplateRoutes } from "./templates.js";
import { scanProject } from "./project.js";
import { detectMoonshineRoot, packagePath, localOverrides } from "../new.js";

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
  if (templateGlobs(scan.framework))
    return {
      file: "tsconfig.json",
      action: "none",
      details: [],
      summary: "native templates need no JSX or host import aliases",
      alreadyApplied: true,
    };
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
    renderer: templateGlobs(scan.framework) ? "native" : "react",
    ...(templateGlobs(scan.framework) && { mode: "ssr" }),
    ...(["next-app", "next-pages"].includes(scan.framework) && {
      requestContext: true,
    }),
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

async function planPackageJson(scan: AdoptScan): Promise<AdoptChange> {
  const path = join(scan.projectDir, "package.json");
  const pkg =
    readJson<{
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
      overrides?: Record<string, string>;
    }>(path) ?? {};
  const root = detectMoonshineRoot();
  const version = `^${cliVersion()}`;

  const dependencies = { ...pkg.dependencies };
  const added: string[] = [];
  const adapter = adapterFor(scan.framework);
  const template = templateGlobs(scan.framework) !== undefined;
  for (const name of [
    ...(template
      ? RUNTIME_DEPS.filter(
          (pkgName) =>
            pkgName !== "@tschk/moonshine-react" &&
            pkgName !== "@tschk/moonshine-compiler",
        )
      : RUNTIME_DEPS),
    ...(adapter ? [adapter.pkg] : []),
    ...(template ? ["@tschk/moonshine-dom"] : []),
  ] as string[]) {
    if (dependencies[name]) continue;
    const spec = packagePath(name, root, version);
    if (!spec) continue;
    dependencies[name] = spec;
    added.push(name);
  }

  const devDependencies = { ...pkg.devDependencies };
  const addedDev: string[] = [];
  if (template)
    for (const name of ["@tschk/moonshine-cli", "@tschk/moonshine-compiler"]) {
      if (!dependencies[name] && !devDependencies[name]) {
        devDependencies[name] = packagePath(name, root, version)!;
        addedDev.push(name);
      }
    }
  const overrides =
    template && root
      ? { ...(await localOverrides(root)), ...pkg.overrides }
      : pkg.overrides;
  const overridesChanged =
    JSON.stringify(overrides) !== JSON.stringify(pkg.overrides);
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

  const alreadyApplied =
    added.length === 0 &&
    addedDev.length === 0 &&
    !overridesChanged &&
    repointed.length === 0;
  const parts: string[] = [];
  if (addedDev.length) parts.push(`+${addedDev.length} dev dependencies`);
  if (overridesChanged) parts.push("local workspace overrides");
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
      ...addedDev.map(
        (name) => `devDependencies["${name}"] = "${devDependencies[name]}"`,
      ),
      ...(overridesChanged
        ? ["local workspace overrides (existing overrides preserved)"]
        : []),
      ...repointed.map((key) => `scripts["${key}"] = "${scripts[key]}"`),
    ],
    summary: alreadyApplied ? "already adopted" : parts.join(", "),
    alreadyApplied,
    contents:
      JSON.stringify(
        {
          ...pkg,
          dependencies,
          ...(template ? { devDependencies } : {}),
          ...(overrides ? { overrides } : {}),
          scripts,
        },
        null,
        2,
      ) + "\n",
  };
}

function cliVersion(): string {
  const pkg = readJson<{ version?: string }>(
    join(import.meta.dir, "../..", "package.json"),
  );
  return pkg?.version ?? "0.3.2";
}

export async function planAdoption(
  projectDir: string,
  options: { force?: boolean; compiler?: string } = {},
): Promise<AdoptPlan> {
  const scan = await scanProject(projectDir, options);
  if (
    scan.templates.length > 0 &&
    scan.templates.every((template) => !template.ok)
  ) {
    throw new Error(
      `No templates compiled; resolve the compiler diagnostics before adopting:\n${scan.templates.map((template) => `  ${template.file}: ${template.error ?? "native emission failed"}`).join("\n")}`,
    );
  }
  return {
    scan,
    changes: [
      planTsconfig(scan),
      planConfig(scan, options.force ?? false),
      await planPackageJson(scan),
      ...(await planTemplateRoutes(scan)),
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
