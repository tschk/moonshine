/** How a plan is shown, and confirmed. */
import { adapterFor } from "./frameworks.js";
import type { AdoptPlan, NextImport } from "./types.js";
import { truncate, warningBar, type Tui } from "../tui.js";

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
