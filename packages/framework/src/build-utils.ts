import { copyFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
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
