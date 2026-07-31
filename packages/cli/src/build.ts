import { resolve } from "node:path";
import { buildProject } from "@tschk/moonshine-compiler";
import type { MoonshineManifest } from "@tschk/moonshine-framework";
import { findConfig, loadConfig } from "./config.js";

type AdapterName = "bun" | "node" | "cloudflare" | "vercel";

function defaultRuntime(adapter: AdapterName): string {
  switch (adapter) {
    case "node":
      return "node";
    case "cloudflare":
      return "cloudflare";
    case "vercel":
      return "vercel-edge";
    case "bun":
    default:
      return "bun";
  }
}

export async function buildCommand(args: string[]): Promise<MoonshineManifest> {
  let projectDir = "";
  let adapter: AdapterName = "bun";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--adapter") {
      const next = args[++i];
      if (!next || !["bun", "node", "cloudflare", "vercel"].includes(next)) {
        console.error(`Invalid --adapter: ${next}`);
        process.exit(1);
      }
      adapter = next as AdapterName;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    } else if (!projectDir) {
      projectDir = arg;
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
  }

  const resolvedDir = resolve(projectDir || process.cwd());
  const configPath = findConfig(resolvedDir);
  const config = configPath ? await loadConfig(configPath) : {};
  const runtime = (config.runtime ?? defaultRuntime(adapter)) as
    "bun" | "node" | "cloudflare" | "vercel-edge";

  const manifest = await buildProject({
    projectDir: resolvedDir,
    runtime,
  });

  const outDir = resolve(resolvedDir, ".moonshine");
  const adapterModule = await import(`@tschk/moonshine-deploy-${adapter}`);
  const adapterFn = adapterModule[`${adapter}Adapter`];
  if (typeof adapterFn?.build !== "function") {
    throw new Error(`Adapter "${adapter}" does not export a build function`);
  }
  await adapterFn.build(manifest, outDir);

  console.log(
    `Built ${manifest.routes.length} routes into .moonshine/manifest.json (${adapter})`,
  );
  return manifest;
}
