export type RenderMode = "auto" | "static" | "ssr" | "island" | "spa" | "api";
export type RuntimeTarget = "bun" | "node" | "cloudflare" | "vercel-edge";

export type RouteDefinition = {
  id: string;
  path: string;
  file: string;
  /** Explicit browser-only page entry for native SPA rendering. */
  clientFile?: string;
  mode?: RenderMode;
  runtime?: RuntimeTarget;
  layouts?: string[];
  middleware?: string[];
  errorBoundary?: string;
  dataFile?: string;
  /**
   * `control` is sent as Cache-Control on successful GET/HEAD responses.
   * `revalidate` (seconds) reuses a rendered response for that long before the
   * next request renders it again, and is advertised to shared caches as
   * `s-maxage` when `control` is not set.
   */
  cache?: { control?: string; revalidate?: number };
};
