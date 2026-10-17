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
};
