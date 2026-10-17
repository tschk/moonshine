import type { RouteArtifact } from "./manifest";

export type RendererName = "react" | "solid" | "crepus" | "native";

export type RenderContext = {
  request: Request;
  route: RouteArtifact;
  params: Record<string, string>;
  data: unknown;
  signal: AbortSignal;
};

/** Native document fields. Undefined inherits; null removes an inherited field. */
export type DocumentMetadata = {
  title?: string | null;
  description?: string | null;
  lang?: string | null;
};

/** Synchronous server-module metadata, evaluated with loaded route data. */
export type Metadata =
  DocumentMetadata | ((context: RenderContext) => DocumentMetadata);

export type Renderer = {
  name: string;
  render(context: RenderContext): Promise<Response>;
  prerender(context: RenderContext): Promise<string>;
};

/** Runs the entire request pipeline in an optional server context. */
export type RequestScope = <T>(request: Request, fn: () => T) => T;
