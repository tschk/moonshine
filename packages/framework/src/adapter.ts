import type { MoonshineManifest } from "./manifest";
import type { RouteDefinition, RuntimeTarget } from "./routes";

export type DeploymentAdapter = {
  name: string;
  runtimes: RuntimeTarget[];
  capabilities: MoonshineManifest["capabilities"];
  build(manifest: MoonshineManifest, outDir: string): Promise<void>;
};

/**
 * A running instance of an adapter, used to exercise it end to end.
 *
 * This lives here rather than in the conformance suite because every deploy
 * package exports a harness as part of its public API (`nodeHarness`,
 * `bunHarness`, ...). With the type owned by the test suite, each of those
 * packages had to declare the suite — fixtures and all — as a production
 * `dependency` purely to name a type, so installing an adapter installed its
 * own test tooling. The suite still owns the tests; the framework owns the
 * shape the adapters implement.
 */
export type Harness = {
  start(): Promise<URL>;
  stop(): Promise<void>;
};

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export type HarnessFactory = (
  fetch: (request: Request) => Promise<Response>,
  options: { manifest: MoonshineManifest; staticDir: string },
) => Harness;

export function defineRoute<T extends RouteDefinition>(route: T): T {
  return route;
}

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

export async function copyAssets(
  assets: MoonshineManifest["assets"],
  outDir: string,
): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      const source = isAbsolute(asset.file)
        ? asset.file
        : resolve(outDir, asset.file);
      const target = resolve(
        outDir,
        (asset.path ?? asset.file).replace(/^\/+/, ""),
      );
      await mkdir(dirname(target), { recursive: true });
      if (source !== target) {
        await copyFile(source, target);
      }
    }),
  );
}

export function validateRuntime(
  adapter: DeploymentAdapter,
  manifest: MoonshineManifest,
): void {
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
