import { createRouteGraph, matchRoutes } from "@tschk/moonshine-router";
import type { RouteDefinition } from "@tschk/moonshine-framework";
import type {
  ErrorBoundary,
  Middleware,
  RequestHandlerOptions,
  RouteContext,
  RouteModule,
} from "./data.js";
import { callAction, callLoader, createRouteContext } from "./data.js";
import { errorResponse, json, Redirect } from "./errors.js";
import { tryServeStatic } from "./static.js";

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isSafeRedirect(location: string, request: Request): boolean {
  try {
    if (hasControlChars(location)) return false;
    const base = new URL(request.url);
    const url = new URL(location, request.url);
    return url.origin === base.origin;
  } catch {
    return false;
  }
}

type ModuleChainItem = {
  key: string;
  module: RouteModule;
};

function buildModuleChain(
  route: RouteDefinition,
  modules: Record<string, RouteModule>,
): ModuleChainItem[] {
  const chain: ModuleChainItem[] = [];

  for (const key of route.layouts ?? []) {
    const module = modules[key];
    if (module) chain.push({ key, module });
  }

  for (const key of route.middleware ?? []) {
    const module = modules[key];
    if (module) chain.push({ key, module });
  }

  const leafKeys: string[] = [
    ...(route.dataFile ? [route.dataFile] : []),
    route.id,
    ...(route.file ? [route.file] : []),
  ];

  for (const key of leafKeys) {
    const module = modules[key];
    if (module) {
      chain.push({ key, module });
      break;
    }
  }

  return chain;
}

function mergeHeaders(
  ...sources: (HeadersInit | Record<string, string> | undefined)[]
): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;

    if (source instanceof Headers) {
      for (const [key, value] of source.entries()) {
        headers.set(key, value);
      }
    } else if (Array.isArray(source)) {
      for (const [key, value] of source) {
        headers.set(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(
        source as Record<string, string>,
      )) {
        headers.set(key, value);
      }
    }
  }

  return headers;
}

function finalizeResponse(
  response: Response,
  baseHeaders?: HeadersInit,
  method?: string,
): Response {
  const headers = new Headers(baseHeaders);
  for (const [key, value] of response.headers.entries()) {
    headers.set(key, value);
  }
  // HEAD must carry the GET headers and no body; shipping one is a protocol
  // violation and mismatches Content-Length on runtimes that do not strip it.
  const body = method === "HEAD" ? null : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function findErrorBoundary(
  chain: ModuleChainItem[],
  route: RouteDefinition,
  modules: Record<string, RouteModule>,
): ErrorBoundary | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].module.errorBoundary) return chain[i].module.errorBoundary;
  }

  if (route.errorBoundary) {
    const module = modules[route.errorBoundary];
    if (module?.errorBoundary) return module.errorBoundary;
  }

  return undefined;
}

function resolveBaseHeaders(
  chain: ModuleChainItem[],
  route: RouteDefinition,
  defaultMeta?: ResponseInit,
): HeadersInit {
  return mergeHeaders(
    defaultMeta?.headers,
    ...chain.map((c) => c.module.headers),
    (route as { headers?: Record<string, string> }).headers,
  );
}

// Derived from the leaf, never hardcoded: an Allow header that lists methods
// the route cannot serve sends clients down paths that will 405 again.
function allowedMethods(leaf: ModuleChainItem | undefined): string {
  const methods = ["GET", "HEAD"];
  if (leaf?.module.action) methods.push("POST", "PUT", "PATCH", "DELETE");
  return methods.join(", ");
}

async function runCoreAndAfters(
  ctx: RouteContext,
  chain: ModuleChainItem[],
  options: RequestHandlerOptions,
  route: RouteDefinition,
): Promise<Response> {
  const method = ctx.request.method;
  const leaf = chain[chain.length - 1];

  if (method !== "GET" && method !== "HEAD") {
    // Without an action there is nothing to serve a write method. Falling
    // through would run the loaders — reachable by any verb, so a
    // CSRF-shaped POST reaches loader side effects — and answer DELETE with
    // 200, which every HTTP client reads as "deleted".
    if (!leaf?.module.action) {
      return new Response(null, {
        status: 405,
        headers: { allow: allowedMethods(leaf) },
      });
    }

    const result = await callAction(leaf.module.action, ctx);
    if (result instanceof Response) return result;
    if (result !== undefined) {
      if (leaf.module.loader) ctx.data.__action = result;
      else ctx.data[leaf.key] = result;
    }
  }

  const loaderEntries = chain.filter((c) => c.module.loader);
  if (loaderEntries.length > 0) {
    ctx.signal.throwIfAborted();
    const results = await Promise.all(
      loaderEntries.map(async (c) => {
        const value = await callLoader(c.module.loader!, ctx);
        return { key: c.key, value };
      }),
    );
    for (const { key, value } of results) {
      if (value !== undefined) ctx.data[key] = value;
    }
  }

  ctx.signal.throwIfAborted();

  let response: Response;
  if (route.mode === "api") {
    const leafData = leaf ? ctx.data[leaf.key] : undefined;
    response = leafData instanceof Response ? leafData : json(ctx.data);
  } else if (route.mode === "static" && options.staticDir) {
    const pathname = new URL(ctx.request.url).pathname;
    const staticRes = await tryServeStatic(
      options.staticDir,
      pathname,
      options.defaultMeta?.headers,
    );
    if (staticRes) {
      response = staticRes;
    } else if (options.renderer) {
      response = await options.renderer.render({
        request: ctx.request,
        route: route as any,
        params: ctx.params,
        data: ctx.data,
        signal: ctx.signal,
      });
    } else {
      throw new Error("No renderer for static route");
    }
  } else if (options.renderer) {
    response = await options.renderer.render({
      request: ctx.request,
      route: route as any,
      params: ctx.params,
      data: ctx.data,
      signal: ctx.signal,
    });
  } else {
    response = json(ctx.data);
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    for (const after of chain[i].module.after ?? []) {
      const next = async () => response;
      response = await after(ctx, next);
    }
  }

  return response;
}

function runBefores(
  ctx: RouteContext,
  index: number,
  befores: Middleware[],
  chain: ModuleChainItem[],
  options: RequestHandlerOptions,
  route: RouteDefinition,
): Promise<Response> {
  if (index >= befores.length) {
    return runCoreAndAfters(ctx, chain, options, route);
  }

  const mw = befores[index]!;
  const next = () => runBefores(ctx, index + 1, befores, chain, options, route);
  return mw(ctx, next);
}

export function createRequestHandler(
  options: RequestHandlerOptions,
): (request: Request) => Promise<Response> {
  // Compiling the route graph is linear in the route count, so build it once
  // per handler instead of once per request.
  let cachedGraph = options.graph;

  return async (request) => {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    if (
      options.staticDir &&
      (method === "GET" || method === "HEAD") &&
      pathname !== "/"
    ) {
      const staticRes = await tryServeStatic(
        options.staticDir,
        pathname,
        options.defaultMeta?.headers,
      );
      if (staticRes) return staticRes;
    }

    const graph = (cachedGraph ??= options.routes
      ? createRouteGraph(options.routes)
      : options.manifest
        ? createRouteGraph(options.manifest.routes)
        : undefined);
    if (!graph) {
      return new Response("No route graph configured", { status: 500 });
    }

    const match = matchRoutes(graph, pathname);
    if (!match) {
      const ctx = createRouteContext(request, {});
      return options.notFound
        ? await options.notFound(ctx)
        : new Response("Not Found", { status: 404 });
    }

    const route = match.route;
    const ctx = createRouteContext(request, match.params);
    const chain = buildModuleChain(route, options.modules ?? {});
    const baseHeaders = resolveBaseHeaders(chain, route, options.defaultMeta);

    try {
      const befores: Middleware[] = [];
      for (const c of chain) befores.push(...(c.module.before ?? []));
      const response = await runBefores(ctx, 0, befores, chain, options, route);
      return finalizeResponse(response, baseHeaders, method);
    } catch (error) {
      if (error instanceof Redirect) {
        if (!isSafeRedirect(error.location, request)) {
          return new Response("Invalid redirect", {
            status: 400,
            headers: baseHeaders,
          });
        }
        const headers = new Headers(baseHeaders);
        headers.set("location", error.location);
        return new Response(null, { status: error.status, headers });
      }

      const boundary = findErrorBoundary(chain, route, options.modules ?? {});
      if (boundary) {
        const res = await boundary(ctx, error);
        return finalizeResponse(res, baseHeaders, method);
      }

      if (error instanceof Response) {
        return finalizeResponse(error, baseHeaders, method);
      }

      return finalizeResponse(
        errorResponse(error, options.mode),
        baseHeaders,
        method,
      );
    }
  };
}
