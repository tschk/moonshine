import type { MoonshineManifest, Renderer, RouteDefinition } from "@tschk/moonshine-framework";
import type { RouteGraph } from "@tschk/moonshine-router";

export type RouteContext = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  data: Record<string, unknown>;
};

export type Loader = (context: RouteContext) => unknown | Promise<unknown>;

export type Action = (
  context: RouteContext,
) => unknown | Response | Promise<unknown | Response>;

export type Middleware = (
  context: RouteContext,
  next: () => Promise<Response>,
) => Promise<Response>;

export type ErrorBoundary = (
  context: RouteContext,
  error: unknown,
) => Response | Promise<Response>;

export type RouteModule = {
  before?: Middleware[];
  after?: Middleware[];
  loader?: Loader;
  action?: Action;
  errorBoundary?: ErrorBoundary;
  headers?: Record<string, string>;
};

export type RequestHandlerOptions = {
  graph?: RouteGraph<RouteDefinition>;
  routes?: RouteDefinition[];
  manifest?: MoonshineManifest;
  modules?: Record<string, RouteModule>;
  renderer?: Renderer;
  staticDir?: string;
  mode?: "development" | "production";
  defaultMeta?: ResponseInit;
  notFound?: (context: RouteContext) => Response | Promise<Response>;
};

export function createRouteContext(
  request: Request,
  params: Record<string, string>,
): RouteContext {
  return {
    request,
    params,
    signal: request.signal,
    data: {},
  };
}

export async function callLoader(
  loader: Loader,
  context: RouteContext,
): Promise<unknown> {
  return await loader(context);
}

export async function callAction(
  action: Action,
  context: RouteContext,
): Promise<unknown | Response> {
  return await action(context);
}
