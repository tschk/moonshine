export type RenderMode = "auto" | "static" | "ssr" | "island" | "spa" | "api";
export type RuntimeTarget = "bun" | "node" | "cloudflare" | "vercel-edge";

export type RouteDefinition = {
  id: string;
  path: string;
  file: string;
  mode?: RenderMode;
  runtime?: RuntimeTarget;
  layouts?: string[];
  middleware?: string[];
  errorBoundary?: string;
  dataFile?: string;
};
