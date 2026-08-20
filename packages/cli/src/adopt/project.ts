/** One scan of a project directory, composed from the pieces around it. */
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { adapterFor, templateGlobs } from "./frameworks.js";
import type { AdoptScan } from "./types.js";
import {
  detectFramework,
  findHostImports,
  readJson,
  sourceFiles,
  toPosix,
  type PackageJson,
} from "./scan.js";
import { compileTemplates } from "./templates.js";
import { findConventions } from "./conventions.js";
import { ALIAS_CAVEATS, findManualWork, templateManualWork } from "./gaps.js";

export async function scanProject(projectDir: string): Promise<AdoptScan> {
  const dir = resolve(projectDir);
  const pkg = readJson<PackageJson>(join(dir, "package.json"));
  const files = sourceFiles(dir);
  const detected = detectFramework(dir, pkg);
  const imports = findHostImports(dir, files, adapterFor(detected.framework));

  const globs = templateGlobs(detected.framework);
  const templates = globs
    ? await compileTemplates(dir, detected.framework, globs)
    : [];

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
      ...(await findManualWork(dir, files, detected)),
      ...[...new Set(imports.map((i) => i.specifier))]
        .sort()
        .map((s) => ALIAS_CAVEATS[s])
        .filter((note): note is string => note !== undefined),
    ],
  };
}
