/**
 * `moonshine adopt` — the command itself.
 *
 * The work is split by what it is about, because this file grew to 1300 lines
 * and stopped being navigable:
 *
 *   frameworks   which hosts moonshine knows, and how their specifiers map
 *   types        the shapes a scan and a plan travel in
 *   scan         what is on disk: sources, imports, framework detection
 *   conventions  host conventions present in the tree, named as the user named them
 *   templates    non-React templates compiled through the parser into route modules
 *   gaps         what does not carry over, per host and per template
 *   project      one scan of a project directory, composed from the above
 *   plan         the changes adoption would make
 *   report       how a plan is shown, and confirmed
 *
 * The public surface is re-exported here so `bin/moonshine.ts` and the tests
 * keep one import site for the command and its plan/report primitives.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { hasFrontend, parserVersion } from "./adopt/frameworks.js";
import {
  detectFramework,
  findProjectRoot,
  readJson,
  type PackageJson,
} from "./adopt/scan.js";
import { planAdoption, applyPlan } from "./adopt/plan.js";
import { formatReport, confirmPlan } from "./adopt/report.js";
import { terminalTui, type Tui } from "./tui.js";
import type { AdoptPlan } from "./adopt/types.js";

export type {
  Framework,
  NextImport,
  TemplateFile,
  AdoptScan,
  AdoptChange,
  AdoptPlan,
} from "./adopt/types.js";
export { hasFrontend } from "./adopt/frameworks.js";
export { findProjectRoot } from "./adopt/scan.js";
export { scanProject } from "./adopt/project.js";
export { aliasPaths, planAdoption, applyPlan } from "./adopt/plan.js";
export { formatReport, formatPlan, confirmPlan } from "./adopt/report.js";

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
  const detected = detectFramework(dir, pkg).framework;
  if (!(await hasFrontend(detected))) {
    const installed = await parserVersion();
    return fail(
      `${dir} is a ${detected} project, but the installed @tschk/crepuscularity-wasm${installed ? ` (${installed})` : ""} has no ${detected} template frontend.\n` +
        `Its dispatcher falls back to generic markup for an extension it does not know, which drops ${detected === "astro" ? "`{cond && <m/>}` / `{list.map(…)}` lowering" : "`@if` / `@for` blocks and the structural directives"} silently — so adopting against this build would produce quietly wrong pages.\n` +
        `Upgrade @tschk/crepuscularity-wasm to a build that carries parser/${detected}/. Nothing was written.`,
    );
  }

  const plan = await planAdoption(dir, { force });
  if (plan.scan.framework === "unknown") {
    return fail(
      `Could not identify a JavaScript app in ${dir}.\n` +
        `Looked for: .svelte, .vue, .astro or Angular (*.component.html, *.ng.html, *.ng) templates, app/ or src/app/ (Next App Router), pages/ or src/pages/ (Next Pages Router), a next/waku/@tanstack/react-router/react-router dependency, a vite config, or a react dependency.\n` +
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
