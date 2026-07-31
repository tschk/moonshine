import { resolve } from "node:path";
import { buildProject } from "@tschk/moonshine-compiler";

export async function buildCommand(args: string[]): Promise<void> {
  const projectDir = args[0] ? resolve(args[0]) : process.cwd();
  const manifest = await buildProject({ projectDir });
  console.log(
    `Built ${manifest.routes.length} routes into .moonshine/manifest.json`,
  );
}
