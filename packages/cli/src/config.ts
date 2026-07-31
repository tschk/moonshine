import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig as baseDefineConfig } from "@tschk/moonshine-framework";
import type { RouteConvention } from "@tschk/moonshine-compiler";
import type {
  MoonshineConfig,
  RouteDefinition,
} from "@tschk/moonshine-framework";

export type RendererName = "react" | "solid" | "crepus";

export type MoonshineCliConfig = MoonshineConfig & {
  adapter?: "bun" | "node" | "cloudflare" | "vercel";
  renderer?: RendererName;
  routes?: RouteDefinition[];
  /** Route directory, relative to the project. Defaults to `src/routes`. */
  routesDir?: string;
  /** File-system routing dialect; `moonshine adopt` sets the `next-*` values. */
  convention?: RouteConvention;
};

export function defineConfig<T extends MoonshineCliConfig>(config: T): T {
  return baseDefineConfig(config);
}

export function findConfig(projectDir: string): string | undefined {
  const candidates = ["moonshine.config.ts", "moonshine.config.js"];
  for (const name of candidates) {
    const path = resolve(projectDir, name);
    if (existsSync(path)) return path;
  }
  return undefined;
}

export async function loadConfig(path: string): Promise<MoonshineCliConfig> {
  const mod = await import(pathToFileURL(path).href);
  const config = mod.default ?? mod;
  if (typeof config !== "object" || config === null) {
    throw new Error(`Invalid moonshine config: ${path}`);
  }
  return config as MoonshineCliConfig;
}
