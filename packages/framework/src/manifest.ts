import { copyFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { RenderMode, RouteDefinition, RuntimeTarget } from "./routes";

export const MANIFEST_VERSION = 1 as const;

/**
 * Build subdirectory holding client assets. It is the only part of the build
 * output a server may expose over HTTP.
 */
export const PUBLIC_DIR = "public" as const;

export type RouteArtifact = RouteDefinition & {
  mode: Exclude<RenderMode, "auto">;
  runtime: RuntimeTarget;
  decision: string;
  serverEntry?: string;
  clientEntries: string[];
  staticOutput?: string;
  cache?: { control?: string; revalidate?: number };
  headers?: Record<string, string>;
};

export type MoonshineManifest = {
  version: typeof MANIFEST_VERSION;
  frameworkVersion: string;
  routes: RouteArtifact[];
  assets: Array<{ path: string; file: string; integrity?: string }>;
  entries: { server?: string; client?: string };
  capabilities: Array<"streaming" | "islands" | "edge" | "revalidation">;
};

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
