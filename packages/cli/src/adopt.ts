import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  nextAliases,
  resolveAlias as resolveNextAlias,
} from "@tschk/moonshine-next/aliases";
import {
  reactRouterAliases,
  resolveAlias as resolveReactRouterAlias,
} from "@tschk/moonshine-react-router/aliases";
import {
  tanstackAliases,
  resolveAlias as resolveTanstackAlias,
} from "@tschk/moonshine-tanstack/aliases";
import {
  wakuAliases,
  resolveAlias as resolveWakuAlias,
} from "@tschk/moonshine-waku/aliases";
import type { RouteConvention } from "@tschk/moonshine-compiler";
import { detectMoonshineRoot, packagePath } from "./new.js";
import { terminalTui, truncate, warningBar, type Tui } from "./tui.js";

export type Framework =
  | "next-app"
  | "next-pages"
  | "react-router"
  | "tanstack"
  | "waku"
  | "svelte"
  | "vue"
  | "vite-react"
  | "react"
  | "unknown";

/** Frameworks with no crepuscularity parser frontend, so nothing to compile. */
export type BlockedFramework = "astro" | "angular";

/** Frameworks adopted by compiling their templates to View IR, not by aliasing imports. */
const TEMPLATE_FRAMEWORKS: Readonly<Record<string, string>> = {
  svelte: ".svelte",
  vue: ".vue",
};

function templateExtension(framework: Framework): string | undefined {
  return TEMPLATE_FRAMEWORKS[framework];
}

/** A host package moonshine reimplements, and how its specifiers map to files. */
type HostAdapter = {
  /** Package the aliases resolve into. */
  pkg: string;
  /** Bare specifier → adapter subpath. */
  aliases: Readonly<Record<string, string>>;
  resolveAlias: (specifier: string) => string | undefined;
  /** A specifier whose backing file sits directly in `src/`, used to locate it. */
  reference: string;
  /** Specifiers in the source that belong to this host, aliasable or not. */
  imports: RegExp;
};

const ADAPTERS = {
  next: {
    pkg: "@tschk/moonshine-next",
    aliases: nextAliases,
    resolveAlias: resolveNextAlias,
    reference: "next/link",
    imports: /^next(?:\/.*)?$/,
  },
  "react-router": {
    pkg: "@tschk/moonshine-react-router",
    aliases: reactRouterAliases,
    resolveAlias: resolveReactRouterAlias,
    reference: "react-router",
    imports: /^(?:react-router|react-router-dom|@remix-run\/[^/]+)$/,
  },
  tanstack: {
    pkg: "@tschk/moonshine-tanstack",
    aliases: tanstackAliases,
    resolveAlias: resolveTanstackAlias,
    reference: "@tanstack/react-router",
    imports: /^@tanstack\/(?:react-router|router-core|react-start|start)$/,
  },
  waku: {
    pkg: "@tschk/moonshine-waku",
    aliases: wakuAliases,
    resolveAlias: resolveWakuAlias,
    reference: "waku/router",
    imports: /^waku(?:\/.*)?$/,
  },
} as const satisfies Record<string, HostAdapter>;

const FRAMEWORK_ADAPTER: Readonly<
  Partial<Record<Framework, keyof typeof ADAPTERS>>
> = {
  "next-app": "next",
  "next-pages": "next",
  "react-router": "react-router",
  tanstack: "tanstack",
  waku: "waku",
};

function adapterFor(framework: Framework): HostAdapter | undefined {
  const id = FRAMEWORK_ADAPTER[framework];
  return id ? ADAPTERS[id] : undefined;
}

export type NextImport = {
  /** Project-relative file holding the import. */
  file: string;
  specifier: string;
  /** Whether `@tschk/moonshine-next` implements this specifier. */
  aliasable: boolean;
};

export type TemplateFile = {
  /** Project-relative `.svelte` / `.vue` file. */
  file: string;
  /** URL path this template becomes, when it maps to one. */
  route?: string;
  /** Project-relative route module generated for it. */
  generated?: string;
  /** Whether the crepuscularity frontend compiled the template. */
  ok: boolean;
  /** View IR nodes produced. */
  nodes?: number;
  /** The compiled View IR, embedded in the generated route module. */
  ir?: unknown;
  /** IR schema version the parser emitted. */
  irVersion?: number;
  /** Parse error, verbatim. Unsupported constructs are errors, not silent drops. */
  error?: string;
};

export type AdoptScan = {
  projectDir: string;
  framework: Framework;
  /** Project-relative route directory, when one was found. */
  routesDir?: string;
  convention?: RouteConvention;
  routes: { path: string; file: string }[];
  /** Templates compiled to View IR, for the Svelte and Vue paths. */
  templates: TemplateFile[];
  imports: NextImport[];
  conventions: string[];
  /** Blunt list of what adoption does not carry over. */
  manual: string[];
};

export type AdoptChange = {
  file: string;
  summary: string;
  /** What the write does to a file that may or may not exist yet. */
  action: "create" | "modify" | "none";
  /** Concrete keys and values the write adds, shown before confirmation. */
  details: string[];
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

/** Every host specifier (`next/*`, `react-router`, …) a source file pulls in. */
function findHostImports(
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

type PackageJson = {
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

function hasLockfile(dir: string): boolean {
  return LOCKFILES.some((name) => existsSync(join(dir, name)));
}

function allDeps(pkg: PackageJson | undefined): Record<string, string> {
  return { ...pkg?.dependencies, ...pkg?.devDependencies };
}

/**
 * Frameworks crepuscularity has no parser frontend for. `.svelte` and `.vue`
 * templates compile to View IR today; `.astro` and Angular templates need a
 * `parser/astro/` and an Angular frontend in crepuscularity-core first, so
 * adoption is refused rather than half-done.
 */
export function detectBlockedFramework(
  projectDir: string,
  pkg: PackageJson | undefined,
):
  | { framework: BlockedFramework; evidence: string; reason: string }
  | undefined {
  const deps = allDeps(pkg);
  const checks: {
    framework: BlockedFramework;
    reason: string;
    deps: string[];
    files: string[];
  }[] = [
    {
      framework: "astro",
      reason:
        "crepuscularity has no `.astro` parser frontend yet (it needs a parser/astro/ in crepuscularity-core), so there is no View IR to render",
      deps: ["astro"],
      files: ["astro.config.mjs", "astro.config.ts", "astro.config.js"],
    },
    {
      framework: "angular",
      reason:
        "crepuscularity has no Angular template parser frontend yet, so there is no View IR to render",
      deps: ["@angular/core"],
      files: ["angular.json"],
    },
  ];
  for (const check of checks) {
    for (const dep of check.deps) {
      if (deps[dep]) {
        return {
          framework: check.framework,
          reason: check.reason,
          evidence: `${dep} in package.json`,
        };
      }
    }
    for (const file of check.files) {
      if (existsSync(join(projectDir, file))) {
        return {
          framework: check.framework,
          reason: check.reason,
          evidence: file,
        };
      }
    }
  }
  return undefined;
}

/** Where `moonshine adopt` writes the route modules it generates from templates. */
const GENERATED_ROUTES = "moonshine/routes";

function hasTemplateFiles(projectDir: string, extension: string): boolean {
  for (const entry of new Bun.Glob(`**/*${extension}`).scanSync(projectDir)) {
    if (!ignored(toPosix(entry))) return true;
  }
  return false;
}

/**
 * Svelte and Vue projects are adopted through crepuscularity's `.svelte` and
 * `.vue` parser frontends: their templates compile to the same View IR as
 * `.crepus` and JSX, which crepus-moonshine renders as React elements.
 */
function detectTemplateFramework(
  projectDir: string,
  deps: Record<string, string>,
):
  | { framework: Framework; routesDir: string; convention: RouteConvention }
  | undefined {
  const svelte =
    deps.svelte ||
    deps["@sveltejs/kit"] ||
    existsSync(join(projectDir, "svelte.config.js")) ||
    existsSync(join(projectDir, "svelte.config.ts")) ||
    hasTemplateFiles(projectDir, ".svelte");
  const vue =
    deps.vue ||
    deps.nuxt ||
    existsSync(join(projectDir, "vue.config.js")) ||
    existsSync(join(projectDir, "nuxt.config.ts")) ||
    hasTemplateFiles(projectDir, ".vue");
  const framework: Framework | undefined = svelte
    ? "svelte"
    : vue
      ? "vue"
      : undefined;
  if (!framework) return undefined;
  return {
    framework,
    routesDir: GENERATED_ROUTES,
    convention: "moonshine",
  };
}

/** Route directory for the conventions moonshine reads directly. */
function findMoonshineRoutes(projectDir: string): string | undefined {
  for (const dir of ["src/routes", "routes", "app/routes"]) {
    if (existsSync(join(projectDir, dir))) return dir;
  }
  return undefined;
}

function detectFramework(
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
    if (detectBlockedFramework(candidate, pkg)) return candidate;
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

function countNodes(nodes: readonly unknown[] = []): number {
  let total = 0;
  for (const node of nodes) {
    total += 1;
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) total += countNodes(children);
  }
  return total;
}

/** URL path a template file serves, or `undefined` when it is a plain component. */
function templateRoute(file: string): string | undefined {
  const segments = file.split("/");
  const base = segments.pop()!;
  const stem = base.replace(/\.(svelte|vue)$/, "");
  const rootIndex = segments.findIndex((s) => s === "routes" || s === "pages");

  if (stem.startsWith("+page")) {
    if (rootIndex === -1) return "/";
    const rest = segments
      .slice(rootIndex + 1)
      .filter((s) => !s.startsWith("("));
    return `/${rest.join("/")}`.replace(/\/$/, "") || "/";
  }
  if (rootIndex !== -1) {
    const rest = [...segments.slice(rootIndex + 1), stem].filter(
      (s) => !s.startsWith("("),
    );
    if (rest.at(-1) === "index") rest.pop();
    return `/${rest.join("/")}`.replace(/\/$/, "") || "/";
  }
  if (/^(app|App)$/.test(stem) && segments.length <= 1) return "/";
  return undefined;
}

function generatedModule(route: string): string {
  const rest = route.replace(/^\//, "");
  return `${GENERATED_ROUTES}/${rest === "" ? "index" : rest}.tsx`;
}

/**
 * Compile every `.svelte` / `.vue` template through the crepuscularity frontend
 * that matches its extension. A template that does not compile is recorded with
 * the parser's own message: unsupported constructs are hard errors, so nothing
 * is silently dropped from the page.
 */
async function compileTemplates(
  projectDir: string,
  extension: string,
): Promise<TemplateFile[]> {
  const { parseTemplate } = await import("@tschk/crepuscularity-wasm");
  const files = [...new Bun.Glob(`**/*${extension}`).scanSync(projectDir)]
    .map(toPosix)
    .filter((file) => !ignored(file))
    .sort();

  const templates: TemplateFile[] = [];
  const taken = new Set<string>();
  for (const file of files) {
    const route = templateRoute(file);
    const entry: TemplateFile = { file, ok: false };
    if (route !== undefined && !taken.has(route)) {
      taken.add(route);
      entry.route = route;
    }
    try {
      const ir = parseTemplate(
        readFileSync(join(projectDir, file), "utf8"),
        file.split("/").pop()!,
      );
      entry.ok = true;
      entry.nodes = countNodes(ir.root ?? []);
      entry.ir = ir;
      entry.irVersion = ir.version;
      if (entry.route !== undefined) {
        entry.generated = generatedModule(entry.route);
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      delete entry.route;
    }
    templates.push(entry);
  }
  return templates;
}

/** Route modules generated from the templates: IR in, React elements out. */
function planTemplateRoutes(scan: AdoptScan): AdoptChange[] {
  const changes: AdoptChange[] = [];
  for (const template of scan.templates) {
    if (!template.generated || !template.route) continue;
    const path = join(scan.projectDir, template.generated);
    const contents = `// Generated by \`moonshine adopt\` from ${template.file}: crepuscularity parsed that template into View IR v${template.irVersion}. Re-run \`moonshine adopt --force\` after editing the template.
import { renderCrepusIr, type CrepusIr } from "@tschk/crepus-moonshine";

const ir = ${JSON.stringify(template.ir, null, 2)} as CrepusIr;

export default function Route() {
  return renderCrepusIr(ir);
}
`;
    const exists = existsSync(path);
    const alreadyApplied = exists && readFileSync(path, "utf8") === contents;
    changes.push({
      file: template.generated,
      action: alreadyApplied ? "none" : exists ? "modify" : "create",
      details: alreadyApplied
        ? []
        : [
            `route ${template.route} renders ${template.file} (${template.nodes ?? 0} View IR nodes)`,
          ],
      summary: alreadyApplied
        ? "already generated"
        : `${exists ? "regenerated" : "generated"} route ${template.route} from ${template.file}`,
      alreadyApplied,
      ...(alreadyApplied ? {} : { contents }),
    });
  }
  return changes;
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

/**
 * The honest boundary of the template path: crepuscularity compiles the markup
 * only. Nothing inside `<script>` runs, so component logic has to be ported.
 */
function templateManualWork(
  framework: Framework,
  templates: TemplateFile[],
): string[] {
  if (!templateExtension(framework) || templates.length === 0) return [];
  const notes: string[] = [
    framework === "svelte"
      ? "<script> blocks are not executed: runes, stores, reactive statements, lifecycle hooks and event handler bodies are compiled as template text, not run. Port that logic to moonshine signals."
      : "<script> blocks are not executed: the Composition API, reactive refs, computed properties and lifecycle hooks do not run. Port that logic to moonshine signals.",
    "Route modules embed the View IR produced at adopt time. Re-run `moonshine adopt --force` after editing a template.",
  ];
  for (const template of templates) {
    if (!template.ok) {
      notes.push(
        `${template.file}: did not compile — ${template.error}. No route was generated for it; unsupported template constructs are parse errors, not silent drops.`,
      );
    } else if (!template.route) {
      notes.push(
        `${template.file}: compiled (${template.nodes} nodes) but maps to no URL, so it is not mounted. Import it from a route module or move it under routes/.`,
      );
    }
  }
  return notes;
}

export async function scanProject(projectDir: string): Promise<AdoptScan> {
  const dir = resolve(projectDir);
  const pkg = readJson<PackageJson>(join(dir, "package.json"));
  const files = sourceFiles(dir);
  const detected = detectFramework(dir, pkg);
  const imports = findHostImports(dir, files, adapterFor(detected.framework));

  const extension = templateExtension(detected.framework);
  const templates = extension ? await compileTemplates(dir, extension) : [];

  const routes: { path: string; file: string }[] = [];
  if (
    detected.routesDir &&
    detected.convention &&
    existsSync(join(dir, detected.routesDir))
  ) {
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
    templates,
    imports,
    conventions: findConventions(dir, files),
    manual: [
      ...templateManualWork(detected.framework, templates),
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
  const template = templateExtension(scan.framework) !== undefined;
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

  if (scan.templates.length) {
    const ok = scan.templates.filter((t) => t.ok);
    push(
      `  templates        ${ok.length}/${scan.templates.length} compiled to View IR`,
    );
    for (const template of scan.templates) {
      const mark = template.ok
        ? template.route
          ? "route"
          : "no url"
        : "FAILED";
      push(
        `      ${template.file.padEnd(34)} ${mark.padEnd(7)} ${template.ok ? `${template.nodes} nodes${template.route ? ` → ${template.route}` : ""}` : template.error}`,
      );
    }
  }

  const bySpecifier = new Map<string, NextImport[]>();
  for (const imp of scan.imports) {
    const list = bySpecifier.get(imp.specifier) ?? [];
    list.push(imp);
    bySpecifier.set(imp.specifier, list);
  }
  if (adapterFor(scan.framework)) {
    push(
      `  host imports     ${scan.imports.length} across ${new Set(scan.imports.map((i) => i.file)).size} files`,
    );
  }
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
  const column = Math.max(...plan.changes.map((c) => c.file.length), 18);
  for (const change of plan.changes) {
    const mark = change.alreadyApplied ? "no-op" : dryRun ? "would" : "wrote";
    push(`  ${mark.padEnd(6)} ${change.file.padEnd(column)} ${change.summary}`);
  }

  const aliased = scan.imports.filter((i) => i.aliasable);
  const unaliasable = scan.imports.filter((i) => !i.aliasable);

  push();
  push("SCORECARD");
  if (adapterFor(scan.framework)) {
    push(
      `  aliased          ${pluralize(aliased.length, "import")} across ${pluralize(new Set(aliased.map((i) => i.file)).size, "file")} — 0 source files edited`,
    );
  }
  if (scan.templates.length) {
    const ok = scan.templates.filter((t) => t.ok);
    push(
      `  compiled         ${pluralize(ok.length, "template")}, ${pluralize(ok.filter((t) => t.route).length, "route")} mounted, ${scan.templates.length - ok.length} failed — 0 source files edited`,
    );
  }
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

/**
 * Every file the run would touch, with the exact keys and values it adds, so
 * the answer to the prompt is informed rather than hopeful.
 */
export function formatPlan(
  plan: AdoptPlan,
  tui: Pick<Tui, "isTTY" | "columns">,
): string {
  const width = tui.columns;
  const lines: string[] = [];
  lines.push(truncate("moonshine adopt will modify", width));
  lines.push(truncate(`  ${plan.scan.projectDir}`, width));
  lines.push("");
  for (const change of plan.changes) {
    const verb =
      change.action === "none"
        ? "unchanged"
        : change.action === "create"
          ? "create"
          : "modify";
    lines.push(truncate(`  ${verb.padEnd(9)} ${change.file}`, width));
    for (const detail of change.details) {
      lines.push(truncate(`              + ${detail}`, width));
    }
  }
  lines.push("");
  lines.push(
    warningBar(
      "DESTRUCTIVE: these files are rewritten in place. Back up or commit first.",
      tui,
    ),
  );
  return lines.join("\n");
}

/**
 * Ask before writing. Without a TTY there is nobody to ask, so the run stops
 * and points at `--yes` instead of blocking forever on a prompt.
 */
export async function confirmPlan(
  plan: AdoptPlan,
  tui: Tui,
): Promise<{ ok: boolean; message?: string }> {
  tui.write(`${formatPlan(plan, tui)}\n`);
  if (!tui.isTTY) {
    return {
      ok: false,
      message:
        "Not a terminal, so there is nothing to confirm with. Re-run with --yes to apply, or --dry-run to inspect.",
    };
  }
  const answer = (await tui.prompt("Apply these changes? [y/N] ")).trim();
  return /^y(es)?$/i.test(answer)
    ? { ok: true }
    : { ok: false, message: "Aborted. Nothing was written." };
}

export type AdoptResult = {
  code: number;
  plan?: AdoptPlan;
  /** True when the plan was written to disk. */
  applied: boolean;
};

export async function adoptCommand(
  args: string[],
  tui: Tui = terminalTui(),
): Promise<AdoptResult> {
  let projectDir = "";
  let dryRun = false;
  let force = false;
  let yes = false;
  const fail = (message: string): AdoptResult => {
    console.error(message);
    return { code: 1, applied: false };
  };

  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--force") force = true;
    else if (arg === "--yes" || arg === "-y") yes = true;
    else if (arg.startsWith("-")) return fail(`Unknown flag: ${arg}`);
    else if (!projectDir) projectDir = arg;
    else return fail(`Unknown flag: ${arg}`);
  }

  const start = resolve(projectDir || process.cwd());
  const dir = projectDir ? start : (findProjectRoot(start) ?? start);
  if (!existsSync(join(dir, "package.json"))) {
    return fail(
      `No package.json in ${dir} — nothing to adopt. Looked for a package.json in ${start} and every directory above it.`,
    );
  }

  const pkg = readJson<PackageJson>(join(dir, "package.json"));
  const blocked = detectBlockedFramework(dir, pkg);
  if (blocked) {
    return fail(
      `${dir} is a ${blocked.framework} project (${blocked.evidence}).\n` +
        `moonshine cannot adopt it yet: ${blocked.reason}.\n` +
        `Nothing was written.`,
    );
  }

  const plan = await planAdoption(dir, { force });
  if (plan.scan.framework === "unknown") {
    return fail(
      `Could not identify a JavaScript app in ${dir}.\n` +
        `Looked for: .svelte or .vue templates, app/ or src/app/ (Next App Router), pages/ or src/pages/ (Next Pages Router), a next/waku/@tanstack/react-router/react-router dependency, a vite config, or a react dependency.\n` +
        `Nothing was written.`,
    );
  }

  if (!dryRun && !yes) {
    const confirmed = await confirmPlan(plan, tui);
    if (!confirmed.ok) {
      tui.write(`${confirmed.message}\n`);
      return { code: 1, plan, applied: false };
    }
  }

  if (!dryRun) applyPlan(plan);
  console.log(formatReport(plan, dryRun));
  return { code: 0, plan, applied: !dryRun };
}
