import { mkdir, rename, rm } from "node:fs/promises";
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
      // The Vercel adapter emits one bundled Node function.
      return "node";
    case "bun":
    default:
      return "bun";
  }
}

export async function buildCommand(args: string[]): Promise<MoonshineManifest> {
  let projectDir = "";
  let adapter: AdapterName | undefined;
  let production = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--adapter") {
      const next = args[++i];
      if (!next || !["bun", "node", "cloudflare", "vercel"].includes(next)) {
        console.error(`Invalid --adapter: ${next}`);
        process.exit(1);
      }
      adapter = next as AdapterName;
    } else if (arg === "--development") {
      production = false;
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
  adapter ??= config.adapter ?? "bun";
  if (!["bun", "node", "cloudflare", "vercel"].includes(adapter)) {
    throw new Error(`Invalid configured adapter: ${adapter}`);
  }
  const nativeRuntime = adapter === "vercel" ? "node" : adapter;
  const runtime = (config.runtime ??
    (config.renderer === "native"
      ? nativeRuntime
      : defaultRuntime(adapter))) as
    "bun" | "node" | "cloudflare" | "vercel-edge";

  const unsupportedServerTarget =
    !["bun", "node"].includes(adapter) ||
    runtime !== adapter ||
    config.routes?.some((route) => route.runtime && route.runtime !== adapter);
  const unsupportedNativeTarget =
    runtime !== nativeRuntime ||
    config.routes?.some(
      (route) => route.runtime && route.runtime !== nativeRuntime,
    );
  if (config.renderer === "native" && unsupportedNativeTarget) {
    throw new Error(
      "Native renderer requires matching Bun, Node or Cloudflare runtimes; Vercel native functions require Node",
    );
  }

  if (config.requestContext && unsupportedServerTarget) {
    throw new Error(
      "Request context supports only matching Bun or Node deployment adapters/runtimes",
    );
  }

  if (config.dataRequests && unsupportedServerTarget) {
    throw new Error(
      "Route data requests support only matching Bun or Node deployment adapters/runtimes",
    );
  }

  const manifest = await buildProject({
    projectDir: resolvedDir,
    runtime,
    renderer: config.renderer,
    requestContext: config.requestContext,
    dataRequests: config.dataRequests,
    mode: config.mode,
    production,
    programmatic: config.routes,
    ...(config.routesDir && {
      routesDir: resolve(resolvedDir, config.routesDir),
    }),
    ...(config.convention && { convention: config.convention }),
  });

  const outDir = resolve(resolvedDir, ".moonshine");
  const adapterSpecifier = `@tschk/moonshine-deploy-${adapter}`;
  let adapterPath: string;
  try {
    adapterPath = Bun.resolveSync(adapterSpecifier, resolvedDir);
  } catch {
    adapterPath = Bun.resolveSync(adapterSpecifier, import.meta.dir);
  }
  const adapterModule = await import(adapterPath);
  const adapterFn = adapterModule[`${adapter}Adapter`];
  if (typeof adapterFn?.build !== "function") {
    throw new Error(`Adapter "${adapter}" does not export a build function`);
  }
  await adapterFn.build(manifest, outDir);
  if (adapter === "vercel") {
    // Vercel reads Build Output from `.vercel/output` in the project root.
    const vercelOutput = resolve(resolvedDir, ".vercel/output");
    await rm(vercelOutput, { recursive: true, force: true });
    await mkdir(resolve(resolvedDir, ".vercel"), { recursive: true });
    await rename(resolve(outDir, ".vercel/output"), vercelOutput);
  }

  console.log(
    `Built ${manifest.routes.length} routes into .moonshine/manifest.json (${adapter})`,
  );
  return manifest;
}
