import type { RouteArtifact } from "./manifest";

export type RenderContext = {
  request: Request;
  route: RouteArtifact;
  params: Record<string, string>;
  data: unknown;
  signal: AbortSignal;
};

export type Renderer = {
  name: string;
  render(context: RenderContext): Promise<Response>;
  prerender(context: RenderContext): Promise<string>;
};
