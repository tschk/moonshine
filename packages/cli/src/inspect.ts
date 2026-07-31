import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readManifest } from "@tschk/moonshine-compiler";
import type { MoonshineManifest } from "@tschk/moonshine-framework";

export function formatInspection(manifest: MoonshineManifest): string {
  const maxPath = Math.max(
    ...manifest.routes.map((route) => route.path.length),
  );
  const lines = manifest.routes.map(
    (route) =>
      `${route.mode.padEnd(8)}${route.path.padEnd(maxPath + 2)}${route.decision}`,
  );
  return `${lines.join("\n")}\n`;
}

export async function inspectCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const positional = args.filter((a) => a !== "--json");
  const manifestPath = positional[0]
    ? resolve(positional[0]!)
    : resolve(process.cwd(), ".moonshine", "manifest.json");

  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  if (json) {
    const file = Bun.file(manifestPath);
    process.stdout.write(await file.text());
    return;
  }

  const manifest = await readManifest(manifestPath);
  process.stdout.write(formatInspection(manifest));
}
