/** What is on disk: source files, host imports, and which framework this is. */
import type { RouteConvention } from "@tschk/moonshine-compiler";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  templateGlobs,
  type Framework,
  type HostAdapter,
} from "./frameworks.js";
import type { NextImport } from "./types.js";

const SOURCE_GLOB = "**/*.{ts,tsx,js,jsx,mjs}";
const IGNORED = ["node_modules/", ".next/", ".moonshine/", "dist/", "build/"];

export const RUNTIME_DEPS = [
  "@tschk/moonshine",
  "@tschk/moonshine-framework",
  "@tschk/moonshine-compiler",
  "@tschk/moonshine-server",
  "@tschk/moonshine-react",
  "@tschk/moonshine-deploy-bun",
] as const;

export function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

export function ignored(rel: string): boolean {
  return IGNORED.some((dir) => rel === dir || rel.includes(dir));
}

export function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function sourceFiles(projectDir: string): string[] {
  const found: string[] = [];
  for (const entry of new Bun.Glob(SOURCE_GLOB).scanSync(projectDir)) {
    const rel = toPosix(entry);
    if (!ignored(rel)) found.push(rel);
  }
  return found.sort();
}

/** Every host specifier (`next/*`, `react-router`, …) a source file pulls in. */
export function findHostImports(
  projectDir: string,
  files: string[],
  adapter: HostAdapter | undefined,
): NextImport[] {
  if (!adapter) return [];
  const pattern = /["']([^"']+)["']/g;
  const found: NextImport[] = [];
  for (const file of files) {
    const source = readFileSync(join(projectDir, file), "utf8");
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]!;
      if (!adapter.imports.test(specifier)) continue;
      // A bare string is only an import when a module keyword introduces it.
      const before = source.slice(Math.max(0, match.index - 40), match.index);
      if (!/(?:from|import|require)\s*\(?\s*$/.test(before)) continue;
      found.push({
        file,
        specifier,
        aliasable: specifier in adapter.aliases,
      });
    }
  }
  return found;
}

export type PackageJson = {
  name?: string;
  workspaces?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

export function hasLockfile(dir: string): boolean {
  return LOCKFILES.some((name) => existsSync(join(dir, name)));
}

export function allDeps(pkg: PackageJson | undefined): Record<string, string> {
  return { ...pkg?.dependencies, ...pkg?.devDependencies };
}

/** Where `moonshine adopt` writes the route modules it generates from templates. */
export const GENERATED_ROUTES = "moonshine/routes";

/** Where compiled-but-unrouted templates land, importable but not mounted. */
export const GENERATED_COMPONENTS = "moonshine/components";

export function templateFiles(
  projectDir: string,
  globs: readonly string[],
): string[] {
  const found = new Set<string>();
  for (const glob of globs) {
    for (const entry of new Bun.Glob(glob).scanSync(projectDir)) {
      const rel = toPosix(entry);
      if (!ignored(rel)) found.add(rel);
    }
  }
  return [...found].sort();
}

/**
 * Projects adopted through a crepuscularity template frontend: `.svelte`,
 * `.vue`, `.astro` and Angular component templates all compile to the same View
 * IR as `.crepus` and JSX, which crepus-moonshine renders as React elements.
 */
export function detectTemplateFramework(
  projectDir: string,
  deps: Record<string, string>,
):
  | { framework: Framework; routesDir: string; convention: RouteConvention }
  | undefined {
  const checks: {
    framework: Framework;
    deps: string[];
    files: string[];
  }[] = [
    {
      framework: "svelte",
      deps: ["svelte", "@sveltejs/kit"],
      files: ["svelte.config.js", "svelte.config.ts"],
    },
    {
      framework: "vue",
      deps: ["vue", "nuxt"],
      files: ["vue.config.js", "nuxt.config.ts"],
    },
    {
      framework: "astro",
      deps: ["astro"],
      files: ["astro.config.mjs", "astro.config.ts", "astro.config.js"],
    },
    {
      framework: "angular",
      deps: ["@angular/core"],
      files: ["angular.json"],
    },
  ];

  for (const check of checks) {
    const declared =
      check.deps.some((dep) => deps[dep] !== undefined) ||
      check.files.some((file) => existsSync(join(projectDir, file)));
    const present =
      templateFiles(projectDir, templateGlobs(check.framework)!).length > 0;
    if (!declared && !present) continue;
    return {
      framework: check.framework,
      routesDir: GENERATED_ROUTES,
      convention: "moonshine",
    };
  }
  return undefined;
}

/** Route directory for the conventions moonshine reads directly. */
export function findMoonshineRoutes(projectDir: string): string | undefined {
  for (const dir of ["src/routes", "routes", "app/routes"]) {
    if (existsSync(join(projectDir, dir))) return dir;
  }
  return undefined;
}

export function detectFramework(
  projectDir: string,
  pkg: PackageJson | undefined,
): { framework: Framework; routesDir?: string; convention?: RouteConvention } {
  const deps = allDeps(pkg);
  const template = detectTemplateFramework(projectDir, deps);
  if (template) return template;
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
  if (deps.next) return { framework: "next-app" };

  const routesDir = findMoonshineRoutes(projectDir);
  const routed = (framework: Framework) => ({
    framework,
    ...(routesDir && { routesDir, convention: "moonshine" as RouteConvention }),
  });

  if (deps.waku || existsSync(join(projectDir, "waku.config.ts"))) {
    return routed("waku");
  }
  if (deps["@tanstack/react-router"] || deps["@tanstack/react-start"]) {
    return routed("tanstack");
  }
  if (
    deps["react-router"] ||
    deps["react-router-dom"] ||
    deps["@remix-run/react"] ||
    existsSync(join(projectDir, "react-router.config.ts")) ||
    existsSync(join(projectDir, "remix.config.js"))
  ) {
    return routed("react-router");
  }
  if (
    existsSync(join(projectDir, "vite.config.ts")) ||
    existsSync(join(projectDir, "vite.config.js"))
  ) {
    return routed("vite-react");
  }
  if (deps.react) return routed("react");
  return { framework: "unknown" };
}

/**
 * Nearest ancestor of `from` that looks like the project being adopted.
 *
 * The nearest `package.json` wins when a framework is detectable there — that
 * is the app the user is standing in, even inside a monorepo. Only when it says
 * nothing does the walk continue to a workspace root (lockfile or `workspaces`).
 */
export function findProjectRoot(from: string): string | undefined {
  let dir = resolve(from);
  const candidates: string[] = [];
  for (;;) {
    if (existsSync(join(dir, "package.json"))) candidates.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const candidate of candidates) {
    const pkg = readJson<PackageJson>(join(candidate, "package.json"));
    if (detectFramework(candidate, pkg).framework !== "unknown")
      return candidate;
  }
  for (const candidate of candidates) {
    const pkg = readJson<PackageJson>(join(candidate, "package.json"));
    if (hasLockfile(candidate) || pkg?.workspaces !== undefined)
      return candidate;
  }
  return candidates[0];
}
