import type { RenderMode, RouteDefinition, RuntimeTarget } from "./routes";
import type { RendererName } from "./renderer";

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
  clientStyles?: string[];
  staticOutput?: string;
  cache?: { control?: string; revalidate?: number };
  headers?: Record<string, string>;
};

export type MoonshineManifest = {
  version: typeof MANIFEST_VERSION;
  frameworkVersion: string;
  renderer?: RendererName;
  requestContext?: boolean;
  routes: RouteArtifact[];
  assets: Array<{ path: string; file: string; integrity?: string }>;
  entries: { server?: string; client?: string };
  capabilities: Array<"streaming" | "islands" | "edge" | "revalidation">;
};
