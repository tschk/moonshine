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

export function resolveManifest(
  manifest: MoonshineManifest,
  projectRoot: string,
  resolveFn: (path1: string, path2: string) => string,
  isAbsoluteFn: (path: string) => boolean,
): MoonshineManifest {
  return {
    ...manifest,
    routes: manifest.routes.map((route) => ({
      ...route,
      file: isAbsoluteFn(route.file)
        ? route.file
        : resolveFn(projectRoot, route.file),
      ...(route.dataFile && {
        dataFile: isAbsoluteFn(route.dataFile)
          ? route.dataFile
          : resolveFn(projectRoot, route.dataFile),
      }),
      ...(route.layouts && {
        layouts: route.layouts.map((layout) =>
          isAbsoluteFn(layout) ? layout : resolveFn(projectRoot, layout),
        ),
      }),
      ...(route.middleware && {
        middleware: route.middleware.map((middleware) =>
          isAbsoluteFn(middleware)
            ? middleware
            : resolveFn(projectRoot, middleware),
        ),
      }),
      ...(route.errorBoundary && {
        errorBoundary: isAbsoluteFn(route.errorBoundary)
          ? route.errorBoundary
          : resolveFn(projectRoot, route.errorBoundary),
      }),
    })),
  };
}
