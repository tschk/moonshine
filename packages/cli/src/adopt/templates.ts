/** Non-React templates, compiled through the parser into route modules. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { emitCrepusSource, requireCrepusCompiler } from "../compile.js";
import type { Framework } from "./frameworks.js";
import type { AdoptChange, AdoptScan, TemplateFile } from "./types.js";
import {
  GENERATED_COMPONENTS,
  GENERATED_ROUTES,
  templateFiles,
} from "./scan.js";

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
export function templateRoute(
  file: string,
  framework: Framework,
): string | undefined {
  // Angular has no file-based routing convention: routes live in the router
  // module's TypeScript, which is not compiled here. Inventing a URL from a
  // component's filename would be a guess, so its components stay unmounted.
  if (framework === "angular") return undefined;
  const segments = file.split("/");
  const base = segments.pop()!;
  const stem = base.replace(/\.(svelte|vue|astro)$/, "");
  const rootIndex = segments.findIndex((s) => s === "routes" || s === "pages");

  if (
    framework === "svelte" &&
    rootIndex !== -1 &&
    !/^\+page(?:@.*)?$/.test(stem)
  ) {
    return undefined;
  }
  if (/^\+page(?:@.*)?$/.test(stem)) {
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

export function generatedModule(route: string): string {
  const rest = route.replace(/^\//, "");
  const name = rest.split("/").at(-1) ?? "";
  const reserved =
    name === "index" ||
    name.startsWith("+") ||
    /\.(data|server|client)$/.test(name);
  return `${GENERATED_ROUTES}/${rest === "" ? "index" : reserved ? `${rest}/index` : rest}.ts`;
}

/**
 * A template that compiles but maps to no URL still becomes a component module,
 * so the compiled IR is importable. Angular has no file-based routing at all, so
 * this is the whole of its output — mounting it stays the user's decision.
 */
export function componentModule(file: string): string {
  return `${GENERATED_COMPONENTS}/${file}.ssr.ts`;
}

/**
 * Compile every template through the crepuscularity frontend its filename
 * selects. A template that does not compile is recorded with the parser's own
 * message. Native emission rejects unsupported IR; accepted markup still needs
 * a fidelity review, especially forms and accessibility.
 */
export async function compileTemplates(
  projectDir: string,
  framework: Framework,
  globs: readonly string[],
  compiler?: string,
): Promise<TemplateFile[]> {
  const files = templateFiles(projectDir, globs);
  if (files.length === 0) return [];
  const executable = requireCrepusCompiler(compiler);

  const taken = new Set<string>();

  const jobs = files.map((file) => {
    const route = templateRoute(file, framework);
    const entry: TemplateFile = { file, ok: false };
    if (route !== undefined && !taken.has(route)) {
      taken.add(route);
      entry.route = route;
    }
    return { file, entry };
  });

  // Reuse the prior adopter's .tsx path without leaving duplicate route IDs.
  for (const { entry } of jobs) {
    if (entry.route === undefined) continue;
    const current = generatedModule(entry.route);
    const legacy = current.slice(0, -3) + ".tsx";
    const hasCurrent = existsSync(join(projectDir, current));
    const hasLegacy = existsSync(join(projectDir, legacy));
    if (hasCurrent && hasLegacy)
      throw new Error(
        `Conflicting generated route files: ${current} and ${legacy}; resolve the duplicate before adopting`,
      );
    entry.generated = hasLegacy ? legacy : current;
  }
  const planned = new Set<string>();
  for (const { entry } of jobs) {
    const outputs = [
      componentModule(entry.file),
      ...(entry.route !== undefined ? [entry.generated!] : []),
    ];
    for (const output of outputs) {
      if (planned.has(output))
        throw new Error(`Conflicting planned output path: ${output}`);
      planned.add(output);
    }
  }
  for (const { entry } of jobs) {
    if (entry.route === undefined) continue;
    const rest = entry.route.replace(/^\//, "");
    const flat = `${GENERATED_ROUTES}/${rest === "" ? "index" : rest}.ts`;
    const current = generatedModule(entry.route);
    if (flat === current) continue;
    for (const previous of [flat, flat.slice(0, -3) + ".tsx"]) {
      if (existsSync(join(projectDir, previous)) && !planned.has(previous)) {
        throw new Error(
          `Unsafe legacy generated route ${previous}; retire it manually before adopting ${entry.route} at ${current}`,
        );
      }
    }
  }
  const templates: TemplateFile[] = [];
  for (const { file, entry } of jobs) {
    try {
      const { source, ir, graph } = await emitCrepusSource(
        join(projectDir, file),
        "moonshine-ssr",
        executable,
      );
      if (graph)
        throw new Error(
          "Module graph adoption is not supported; use moonshine compile for authored modules",
        );
      entry.ok = true;
      entry.source = source;
      entry.component = componentModule(file);
      if (ir) {
        entry.nodes = countNodes(ir.root ?? []);
        entry.irVersion = ir.version;
      }
      if (entry.route === undefined) entry.generated = entry.component;
    } catch (error: unknown) {
      if (
        entry.route !== undefined &&
        entry.generated &&
        existsSync(join(projectDir, entry.generated))
      ) {
        throw new Error(
          `Cannot replace existing generated route ${entry.generated}: ${error instanceof Error ? error.message : String(error)}; resolve the failed template before adopting`,
          { cause: error },
        );
      }
      entry.ok = false;
      delete entry.generated;
      entry.error = error instanceof Error ? error.message : String(error);
      delete entry.route;
    }
    templates.push(entry);
  }

  return templates;
}

/** Native compiler bytes stay unchanged; route wrappers expose only explicit request data. */
export async function planTemplateRoutes(
  scan: AdoptScan,
): Promise<AdoptChange[]> {
  const files: Array<{ file: string; contents: string; summary: string }> = [];
  for (const template of scan.templates) {
    if (
      !template.generated ||
      !template.component ||
      template.source === undefined
    )
      continue;
    files.push({
      file: template.component,
      contents: template.source,
      summary: `native SSR component from ${template.file}`,
    });
    if (template.route !== undefined) {
      // Route wrappers may be nested; derive their relative component path.
      const relativePath = relative(
        dirname(template.generated),
        template.component,
      )
        .split(sep)
        .join("/");
      files.push({
        file: template.generated,
        summary: `SSR route ${template.route} from ${template.file}`,
        contents: `// Generated by moonshine adopt. Port template state/handlers explicitly; scripts are not executed.
import Component from ${JSON.stringify(relativePath.startsWith(".") ? relativePath : "./" + relativePath)};

export default function Route({ params, data }: { params: Record<string, string>; data: unknown }) {
  return Component({ scope: { params, data } });
}
`,
      });
    }
  }
  const outputs = new Set<string>();
  for (const { file } of files) {
    if (outputs.has(file))
      throw new Error(`Conflicting planned output path: ${file}`);
    outputs.add(file);
  }
  return Promise.all(
    files.map(async ({ file, contents, summary }) => {
      let existing: string | undefined;
      try {
        existing = await readFile(join(scan.projectDir, file), "utf8");
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const alreadyApplied = existing === contents;
      return {
        file,
        action: alreadyApplied
          ? "none"
          : existing === undefined
            ? "create"
            : "modify",
        summary: alreadyApplied ? "already generated" : summary,
        details: alreadyApplied ? [] : [summary],
        alreadyApplied,
        ...(alreadyApplied ? {} : { contents }),
      } as AdoptChange;
    }),
  );
}
