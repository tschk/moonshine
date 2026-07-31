import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { nextAliases, resolveAlias } from "@tschk/moonshine-next/aliases";
import type { RouteConvention } from "@tschk/moonshine-compiler";
import { detectMoonshineRoot, packagePath } from "./new.js";

export type Framework = "next-app" | "next-pages" | "vite-react" | "unknown";

export type NextImport = {
  /** Project-relative file holding the import. */
  file: string;
  specifier: string;
  /** Whether `@tschk/moonshine-next` implements this specifier. */
  aliasable: boolean;
};

export type AdoptScan = {
  projectDir: string;
  framework: Framework;
  /** Project-relative route directory, when one was found. */
  routesDir?: string;
  convention?: RouteConvention;
  routes: { path: string; file: string }[];
  imports: NextImport[];
  conventions: string[];
  /** Blunt list of what adoption does not carry over. */
  manual: string[];
};

export type AdoptChange = {
  file: string;
  summary: string;
  /** Already true before this run; used to keep repeat runs honest. */
  alreadyApplied: boolean;
  contents?: string;
};

export type AdoptPlan = {
  scan: AdoptScan;
  changes: AdoptChange[];
  /** Source files whose imports had to be edited because no alias covered them. */
  rewritten: string[];
};

const SOURCE_GLOB = "**/*.{ts,tsx,js,jsx,mjs}";
const IGNORED = ["node_modules/", ".next/", ".moonshine/", "dist/", "build/"];

const RUNTIME_DEPS = [
  "@tschk/moonshine",
  "@tschk/moonshine-framework",
  "@tschk/moonshine-compiler",
  "@tschk/moonshine-server",
  "@tschk/moonshine-react",
  "@tschk/moonshine-next",
  "@tschk/moonshine-deploy-bun",
] as const;

function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

function ignored(rel: string): boolean {
  return IGNORED.some((dir) => rel === dir || rel.includes(dir));
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function sourceFiles(projectDir: string): string[] {
  const found: string[] = [];
  for (const entry of new Bun.Glob(SOURCE_GLOB).scanSync(projectDir)) {
    const rel = toPosix(entry);
    if (!ignored(rel)) found.push(rel);
  }
  return found.sort();
}

/** Every `next` / `next/*` specifier a source file pulls in. */
function findNextImports(projectDir: string, files: string[]): NextImport[] {
  const pattern = /["'](next(?:\/[^"']*)?)["']/g;
  const found: NextImport[] = [];
  for (const file of files) {
    const source = readFileSync(join(projectDir, file), "utf8");
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]!;
      // A bare string is only an import when a module keyword introduces it.
      const before = source.slice(Math.max(0, match.index - 40), match.index);
      if (!/(?:from|import|require)\s*\(?\s*$/.test(before)) continue;
      found.push({
        file,
        specifier,
        aliasable: specifier in nextAliases,
      });
    }
  }
  return found;
}

function detectFramework(
  projectDir: string,
  pkg: { dependencies?: Record<string, string> } | undefined,
): { framework: Framework; routesDir?: string; convention?: RouteConvention } {
  for (const dir of ["app", "src/app"]) {
    if (
      existsSync(join(projectDir, dir, "page.tsx")) ||
      existsSync(join(projectDir, dir, "page.jsx")) ||
      existsSync(join(projectDir, dir, "layout.tsx"))
    ) {
      return { framework: "next-app", routesDir: dir, convention: "next-app" };
    }
  }
  for (const dir of ["pages", "src/pages"]) {
    if (existsSync(join(projectDir, dir))) {
      return {
        framework: "next-pages",
        routesDir: dir,
        convention: "next-pages",
      };
    }
  }
  if (
    existsSync(join(projectDir, "vite.config.ts")) ||
    existsSync(join(projectDir, "vite.config.js"))
  ) {
    return { framework: "vite-react" };
  }
  return { framework: pkg?.dependencies?.next ? "next-app" : "unknown" };
}

/** Next conventions present in the tree, named the way the user named them. */
function findConventions(projectDir: string, files: string[]): string[] {
  const seen: string[] = [];
  for (const candidate of [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "middleware.ts",
    "middleware.js",
    "src/middleware.ts",
    "instrumentation.ts",
  ]) {
    if (existsSync(join(projectDir, candidate))) seen.push(candidate);
  }
  for (const file of files) {
    const base = file.split("/").pop()!;
    const stem = base.replace(/\.[jt]sx?$/, "");
    if (
      [
        "layout",
        "route",
        "loading",
        "template",
        "not-found",
        "error",
        "default",
      ].includes(stem)
    ) {
      seen.push(file);
    }
  }
  return seen;
}

/** Source-level Next features with no moonshine equivalent yet. */
function findManualWork(
  projectDir: string,
  files: string[],
  scan: Pick<AdoptScan, "framework" | "routesDir">,
): string[] {
  const manual: string[] = [];
  const note = (text: string) => {
    if (!manual.includes(text)) manual.push(text);
  };

  for (const candidate of [
    "middleware.ts",
    "middleware.js",
    "src/middleware.ts",
  ]) {
    if (existsSync(join(projectDir, candidate))) {
      note(
        `${candidate}: Next middleware does not run. Moonshine has no edge middleware phase — port it to a route loader or a Bun server wrapper.`,
      );
    }
  }
  for (const candidate of [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
  ]) {
    if (existsSync(join(projectDir, candidate))) {
      note(
        `${candidate}: not read. redirects/rewrites/headers/images/webpack options are all ignored.`,
      );
    }
  }

  for (const file of files) {
    const source = readFileSync(join(projectDir, file), "utf8");
    const stem = file
      .split("/")
      .pop()!
      .replace(/\.[jt]sx?$/, "");

    if (
      /export\s+(?:const|async\s+function|function)\s+generateMetadata/.test(
        source,
      )
    ) {
      note(
        `${file}: generateMetadata() is not called. Moonshine emits its own <head>; move tags into a layout.`,
      );
    } else if (/export\s+const\s+metadata\b/.test(source)) {
      note(
        `${file}: the metadata export is not read. Moonshine emits its own <head>; move tags into a layout.`,
      );
    }
    if (/export\s+const\s+revalidate\b/.test(source)) {
      note(`${file}: ISR (export const revalidate) is not implemented.`);
    }
    if (/^\s*["']use server["']/m.test(source)) {
      note(`${file}: server actions ("use server") are not supported.`);
    }
    if (/export\s+default\s+async\s+function/.test(source) && stem === "page") {
      note(
        `${file}: async server component. Moonshine renders with react-dom/server, which cannot await a component — move the fetch into a loader.`,
      );
    }
    if (stem === "layout" && /<html\b/.test(source)) {
      note(
        `${file}: returns <html>/<body>, but moonshine already emits the document shell. Return a fragment instead.`,
      );
    }
    if (["loading", "template", "not-found", "default"].includes(stem)) {
      note(`${file}: ${stem}.tsx has no moonshine equivalent and is ignored.`);
    }
    if (/getServerSideProps|getStaticProps|getStaticPaths/.test(source)) {
      note(
        `${file}: getServerSideProps/getStaticProps are not called. Rename to a moonshine loader.`,
      );
    }
  }

  if (scan.routesDir) {
    for (const file of files) {
      if (!file.startsWith(`${scan.routesDir}/`)) continue;
      const segments = file.split("/");
      if (segments.some((s) => s.startsWith("@"))) {
        note(`${file}: parallel routes (@slot) are dropped.`);
      }
      if (segments.some((s) => /^\(\.+\)/.test(s))) {
        note(`${file}: intercepting routes are dropped.`);
      }
    }
  }

  return manual;
}

/** Behavioural gaps in the reimplementations the app actually imports. */
const ALIAS_CAVEATS: Readonly<Record<string, string>> = {
  "next/image":
    "next/image renders a plain <img>: no resizing, no AVIF/WebP negotiation, no blur placeholder.",
  "next/link":
    "next/link navigates through the moonshine router; prefetch is a browser <link rel=prefetch> hint, not an RSC payload warm-up.",
  "next/headers":
    "next/headers reads the moonshine request context; cookie mutations do not propagate to the response.",
  "next/font/google":
    "next/font/google emits a Google Fonts <link> instead of self-hosting; call fontLinks() in your layout head or the family never loads.",
  "next/dynamic":
    "next/dynamic lazy-loads on the client only; `ssr: false` is the effective behaviour either way.",
};

export async function scanProject(projectDir: string): Promise<AdoptScan> {
  const dir = resolve(projectDir);
  const pkg = readJson<{ dependencies?: Record<string, string> }>(
    join(dir, "package.json"),
  );
  const files = sourceFiles(dir);
  const detected = detectFramework(dir, pkg);
  const imports = findNextImports(dir, files);

  const routes: { path: string; file: string }[] = [];
  if (detected.routesDir && detected.convention) {
    const { discoverRoutes } = await import("@tschk/moonshine-compiler");
    const discovered = await discoverRoutes({
      routesDir: join(dir, detected.routesDir),
      convention: detected.convention,
    });
    for (const route of discovered) {
      routes.push({
        path: route.path,
        file: toPosix(relative(dir, route.file)),
      });
    }
  }

  return {
    projectDir: dir,
    framework: detected.framework,
    ...(detected.routesDir && { routesDir: detected.routesDir }),
    ...(detected.convention && { convention: detected.convention }),
    routes,
    imports,
    conventions: findConventions(dir, files),
    manual: [
      ...findManualWork(dir, files, detected),
      ...[...new Set(imports.map((i) => i.specifier))]
        .sort()
        .map((s) => ALIAS_CAVEATS[s])
        .filter((note): note is string => note !== undefined),
    ],
  };
}

/**
 * Where the project will find `@tschk/moonshine-next` on disk. Only installed
 * `node_modules` trees count: adopt normally runs before `bun install`, and
 * `Bun.resolveSync` would then answer with whatever version happens to sit in
 * the global module cache — a copy that can predate the adapter's current
 * surface, leaving specifiers pointing at files that do not exist.
 */
function adapterDir(projectDir: string): string {
  let dir = projectDir;
  for (;;) {
    const candidate = join(dir, "node_modules", "@tschk", "moonshine-next");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(projectDir, "node_modules", "@tschk", "moonshine-next");
}

/**
 * `compilerOptions.paths` entries pointing every aliasable `next/*` specifier
 * at a real file. Bun applies tsconfig paths in both `bun run` and `Bun.build`,
 * but only for relative targets — a bare package specifier is not remapped.
 */
export function aliasPaths(projectDir: string): Record<string, string[]> {
  const pkgDir = adapterDir(projectDir);
  const srcDir = dirname(resolveAlias("next/link")!);
  const paths: Record<string, string[]> = {};
  for (const specifier of Object.keys(nextAliases)) {
    const source = resolveAlias(specifier);
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
  const wanted = aliasPaths(scan.projectDir);
  const paths = { ...previous, ...wanted };
  compilerOptions.baseUrl = compilerOptions.baseUrl ?? ".";
  compilerOptions.jsx = compilerOptions.jsx ?? "react-jsx";
  compilerOptions.paths = paths;

  const alreadyApplied = Object.entries(wanted).every(
    ([key, value]) => previous[key]?.[0] === value[0],
  );

  return {
    file: "tsconfig.json",
    summary: alreadyApplied
      ? `already aliases ${Object.keys(wanted).length} next/* specifiers`
      : `aliases ${Object.keys(wanted).length} next/* specifiers to @tschk/moonshine-next`,
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
  for (const name of RUNTIME_DEPS) {
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
    if (current !== undefined && !/^next(\s|$)/.test(current)) continue;
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
    writeFileSync(join(plan.scan.projectDir, change.file), change.contents);
  }
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function formatReport(plan: AdoptPlan, dryRun: boolean): string {
  const { scan } = plan;
  const lines: string[] = [];
  const push = (text = "") => lines.push(text);

  push(`moonshine adopt — ${scan.projectDir}${dryRun ? "  (dry run)" : ""}`);
  push();
  push("SCAN");
  push(`  framework        ${scan.framework}`);
  push(`  routes dir       ${scan.routesDir ?? "(none found)"}`);
  push(`  routes           ${scan.routes.length}`);
  for (const route of scan.routes.slice(0, 12)) {
    push(`      ${route.path.padEnd(24)} ${route.file}`);
  }
  if (scan.routes.length > 12) push(`      … ${scan.routes.length - 12} more`);

  const bySpecifier = new Map<string, NextImport[]>();
  for (const imp of scan.imports) {
    const list = bySpecifier.get(imp.specifier) ?? [];
    list.push(imp);
    bySpecifier.set(imp.specifier, list);
  }
  push(
    `  next/* imports   ${scan.imports.length} across ${new Set(scan.imports.map((i) => i.file)).size} files`,
  );
  for (const [specifier, list] of [...bySpecifier].sort()) {
    const mark = list[0]!.aliasable ? "alias" : "NO IMPL";
    push(
      `      ${specifier.padEnd(24)} ${mark.padEnd(8)} ${list.map((l) => l.file).join(", ")}`,
    );
  }
  if (scan.conventions.length) {
    push(`  conventions      ${scan.conventions.join(", ")}`);
  }

  push();
  push(dryRun ? "REWRITE (planned)" : "REWRITE");
  for (const change of plan.changes) {
    const mark = change.alreadyApplied ? "no-op" : dryRun ? "would" : "wrote";
    push(`  ${mark.padEnd(6)} ${change.file.padEnd(22)} ${change.summary}`);
  }

  const aliased = scan.imports.filter((i) => i.aliasable);
  const unaliasable = scan.imports.filter((i) => !i.aliasable);

  push();
  push("SCORECARD");
  push(
    `  aliased          ${pluralize(aliased.length, "import")} across ${pluralize(new Set(aliased.map((i) => i.file)).size, "file")} — 0 source files edited`,
  );
  push(`  rewritten        ${pluralize(plan.rewritten.length, "source file")}`);
  for (const file of plan.rewritten) push(`      ${file}`);

  const blockers = [
    ...unaliasable.map(
      (i) =>
        `${i.file}: imports ${i.specifier}, which @tschk/moonshine-next does not implement. This import will not resolve.`,
    ),
    ...scan.manual,
  ];
  push(`  cannot automate  ${blockers.length}`);
  for (const item of blockers) push(`      - ${item}`);

  push();
  if (dryRun) {
    push("Nothing was written. Drop --dry-run to apply.");
  } else {
    push("Next:");
    push("  bun install");
    push("  bunx moonshine build && bunx moonshine preview");
  }
  return lines.join("\n");
}

export async function adoptCommand(args: string[]): Promise<AdoptPlan> {
  let projectDir = "";
  let dryRun = false;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--force") force = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    } else if (!projectDir) {
      projectDir = arg;
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
  }

  const dir = resolve(projectDir || process.cwd());
  if (!existsSync(join(dir, "package.json"))) {
    console.error(`No package.json in ${dir} — nothing to adopt.`);
    process.exit(1);
  }

  const plan = await planAdoption(dir, { force });
  if (plan.scan.framework === "unknown") {
    console.error(
      `Could not identify a Next or React app in ${dir}. Expected app/, pages/, or a vite config.`,
    );
    process.exit(1);
  }
  if (!dryRun) applyPlan(plan);
  console.log(formatReport(plan, dryRun));
  return plan;
}
