import { copyFile, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { DeploymentAdapter } from "./adapter";
import type { MoonshineManifest } from "./manifest";

export function resolveManifestFiles(
  manifest: MoonshineManifest,
  projectRoot: string,
): MoonshineManifest {
  return {
    ...manifest,
    routes: manifest.routes.map((route) => ({
      ...route,
      file: isAbsolute(route.file)
        ? route.file
        : resolve(projectRoot, route.file),
      ...(route.dataFile && {
        dataFile: isAbsolute(route.dataFile)
          ? route.dataFile
          : resolve(projectRoot, route.dataFile),
      }),
      ...(route.clientFile && {
        clientFile: isAbsolute(route.clientFile)
          ? route.clientFile
          : resolve(projectRoot, route.clientFile),
      }),
      ...(route.layouts && {
        layouts: route.layouts.map((layout) =>
          isAbsolute(layout) ? layout : resolve(projectRoot, layout),
        ),
      }),
      ...(route.middleware && {
        middleware: route.middleware.map((middleware) =>
          isAbsolute(middleware)
            ? middleware
            : resolve(projectRoot, middleware),
        ),
      }),
      ...(route.errorBoundary && {
        errorBoundary: isAbsolute(route.errorBoundary)
          ? route.errorBoundary
          : resolve(projectRoot, route.errorBoundary),
      }),
    })),
  };
}

function within(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function copyAsset(
  asset: MoonshineManifest["assets"][number],
  outDir: string,
): Promise<string> {
  const source = isAbsolute(asset.file)
    ? asset.file
    : resolve(outDir, asset.file);
  const publicRoot = resolve(outDir, "public");
  const [realSource, realPublic] = await Promise.all([
    realpath(source),
    realpath(publicRoot).catch(() => publicRoot),
  ]);
  if (within(publicRoot, source) && !within(realPublic, realSource))
    throw new Error(`Public asset escapes its directory: ${asset.file}`);
  if (within(realPublic, realSource)) {
    const stored = within(publicRoot, source)
      ? relative(publicRoot, source)
      : relative(realPublic, realSource);
    return `public/${stored.split(sep).join("/")}`;
  }
  const target = resolve(
    outDir,
    (asset.path ?? asset.file).replace(/^\/+/, ""),
  );
  await mkdir(dirname(target), { recursive: true });
  if (source !== target) {
    await copyFile(source, target);
  }
  return (asset.path ?? asset.file).replace(/^\/+/, "");
}

export async function copyAssets(
  assets: MoonshineManifest["assets"],
  outDir: string,
): Promise<void> {
  await Promise.all(assets.map((asset) => copyAsset(asset, outDir)));
}

export function validateRuntime(
  adapter: DeploymentAdapter,
  manifest: MoonshineManifest,
): void {
  const nativeRuntime = adapter.name === "vercel" ? "node" : adapter.name;
  if (
    manifest.renderer === "native" &&
    (!["bun", "node", "cloudflare", "vercel"].includes(adapter.name) ||
      manifest.routes.some((route) => route.runtime !== nativeRuntime))
  ) {
    throw new Error(
      "Native renderer requires matching Bun, Node or Cloudflare runtimes; Vercel native functions require Node",
    );
  }
  if (
    manifest.requestContext &&
    (!["bun", "node"].includes(adapter.name) ||
      manifest.routes.some((route) => route.runtime !== adapter.name))
  ) {
    throw new Error(
      "Request context supports only matching Bun or Node deployment adapters/runtimes",
    );
  }
  const errors: string[] = [];
  for (const route of manifest.routes) {
    if (!adapter.runtimes.includes(route.runtime)) {
      errors.push(
        `${adapter.name} adapter does not support route "${route.path}" with runtime "${route.runtime}"; supported runtimes: ${adapter.runtimes.join(", ")}`,
      );
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

export function validateCapabilities(
  adapter: DeploymentAdapter,
  manifest: MoonshineManifest,
): void {
  for (const capability of manifest.capabilities) {
    if (!adapter.capabilities.includes(capability)) {
      throw new Error(
        `${adapter.name} adapter does not support capability "${capability}"; supported capabilities: ${adapter.capabilities.join(", ")}`,
      );
    }
  }
}
