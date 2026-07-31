import type { RenderMode, RouteDefinition, RuntimeTarget } from "./routes";

export const MANIFEST_VERSION = 1 as const;

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
