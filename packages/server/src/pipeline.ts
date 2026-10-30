import { createRouteGraph, matchRoutes } from "@tschk/moonshine-router/graph";
import type {
  RouteData,
  RouteArtifact,
  RouteDefinition,
} from "@tschk/moonshine-framework";
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
    if (location.startsWith("//") || location.includes("\\")) return false;
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
    const module = Object.hasOwn(modules, key) ? modules[key] : undefined;
    if (module) chain.push({ key, module });
  }

  for (const key of route.middleware ?? []) {
    const module = Object.hasOwn(modules, key) ? modules[key] : undefined;
    if (module) chain.push({ key, module });
  }

  const leafKeys: string[] = [
    ...(route.dataFile ? [route.dataFile] : []),
    route.id,
    ...(route.file ? [route.file] : []),
  ];

  for (const key of leafKeys) {
    const module = Object.hasOwn(modules, key) ? modules[key] : undefined;
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

    const entries =
      source instanceof Headers || Array.isArray(source)
        ? source
        : Object.entries(source);
    for (const [key, value] of entries) {
      // Cookies are separate response fields; joining or replacing loses sessions.
      if (key.toLowerCase() === "set-cookie") headers.append(key, value);
      else headers.set(key, value);
    }
  }

  return headers;
}

function isRouteData(value: unknown): value is RouteData {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "DataWithResponseInit" &&
    Object.hasOwn(value, "data") &&
    "init" in value &&
    typeof value.init === "object" &&
    value.init !== null
  );
}

function discardResponse(response: Response, retained?: Response): void {
  const body = response.body;
  if (!body || body === retained?.body || body.locked || response.bodyUsed)
    return;
  try {
    void body.cancel().catch(() => {});
  } catch {
    // Discarding an unused body must not replace the selected response/error.
  }
}

function discardReplacedResponse(
  response: Response,
  retained?: Response,
): void {
  // shortcut: a returned stream may consume this body later; stronger cleanup needs explicit ownership.
  if (retained?.body) return;
  discardResponse(response, retained);
}

function finalizeResponse(
  response: Response,
  baseHeaders?: HeadersInit,
  method?: string,
): Response {
  const headers = mergeHeaders(baseHeaders, response.headers);
  // HEAD must carry the GET headers and no body; shipping one is a protocol
  // violation and mismatches Content-Length on runtimes that do not strip it.
  const body = method === "HEAD" ? null : response.body;
  if (method === "HEAD") discardResponse(response);
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
    const module = Object.hasOwn(modules, route.errorBoundary)
      ? modules[route.errorBoundary]
      : undefined;
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
  if (leaf?.module.methods) return leaf.module.methods.join(", ");
  const methods = ["GET", "HEAD"];
  if (leaf?.module.action) methods.push("POST", "PUT", "PATCH", "DELETE");
  return methods.join(", ");
}

async function runCoreAndAfters(
  ctx: RouteContext,
  chain: ModuleChainItem[],
  options: RequestHandlerOptions,
  route: RouteDefinition,
  dataRequest: DataRequestPolicy | undefined,
): Promise<Response> {
  const method = ctx.request.method;
  const leaf = chain[chain.length - 1];

  if (leaf?.module.methods && !leaf.module.methods.includes(method)) {
    return new Response(null, {
      status: 405,
      headers: { allow: allowedMethods(leaf) },
    });
  }

  const dataHeaders = new Headers();
  let dataStatus: number | undefined;
  let dataStatusText: string | undefined;
  let actionInit: ResponseInit | undefined;
  const unpack = (value: unknown, applyInit = true) => {
    if (!isRouteData(value)) return value;
    const init = value.init;
    // Validate metadata before rendering and use the platform's header rules.
    const metadata = new Response(null, init);
    if (!applyInit) return value.data;
    for (const [key, header] of metadata.headers) {
      if (key.toLowerCase() === "set-cookie") dataHeaders.append(key, header);
      else dataHeaders.set(key, header);
    }
    if (init.status !== undefined) dataStatus = metadata.status;
    if (init.statusText !== undefined) dataStatusText = metadata.statusText;
    return value.data;
  };
  let actionResponse: Response | undefined;
  let actionData: unknown = null;
  const writeMethod = method !== "GET" && method !== "HEAD";
  if (writeMethod) {
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

    ctx.signal.throwIfAborted();
    const actionResult = await callAction(leaf.module.action, ctx);
    if (isRouteData(actionResult)) actionInit = actionResult.init;
    if (actionResult instanceof Response) actionResponse = actionResult;
    else if (dataRequest) {
      actionData = unpack(actionResult, false) ?? null;
    } else if (actionResult !== undefined) {
      const result = unpack(actionResult, false);
      if (leaf.module.loader) ctx.data.__action = result;
      else ctx.data[leaf.key] = result;
    }
  }

  let loaderResponse: Response | undefined;
  const loaderEntries =
    actionResponse || (dataRequest && writeMethod)
      ? []
      : chain.filter((c) => c.module.loader);
  if (loaderEntries.length > 0) {
    ctx.signal.throwIfAborted();
    const resolvedResponses: Response[] = [];
    let failed = false;
    let failureResponse: Response | undefined;
    let results: Array<{ key: string; value: unknown }>;
    try {
      results = await Promise.all(
        loaderEntries.map(async (c) => {
          const value = await callLoader(c.module.loader!, ctx);
          if (value instanceof Response) {
            if (failed) discardResponse(value, failureResponse);
            else resolvedResponses.push(value);
          }
          return { key: c.key, value };
        }),
      );
      ctx.signal.throwIfAborted();
    } catch (error) {
      failed = true;
      failureResponse = error instanceof Response ? error : undefined;
      for (const response of resolvedResponses)
        discardResponse(response, failureResponse);
      throw error;
    }
    // Promise.all preserves chain order: outer loaders take response precedence.
    try {
      for (const { key, value } of results) {
        if (value instanceof Response) loaderResponse ??= value;
        else if (value !== undefined) ctx.data[key] = unpack(value);
      }
    } catch (error) {
      for (const response of resolvedResponses) discardResponse(response);
      throw error;
    }
    for (const response of resolvedResponses)
      discardResponse(response, loaderResponse);
  }

  if (!actionResponse) ctx.signal.throwIfAborted();

  let response: Response;
  let envelope = false;
  if (actionResponse) {
    response = actionResponse;
  } else if (loaderResponse) {
    response = loaderResponse;
  } else if (dataRequest) {
    envelope = true;
    response = dataRequest.encode(writeMethod ? actionData : ctx.data);
  } else if (route.mode === "api") {
    response = json(ctx.data);
  } else if (route.mode === "static" && options.staticDir) {
    const pathname = new URL(ctx.request.url).pathname;
    const staticRes = await tryServeStatic(
      options.staticDir,
      pathname,
      options.defaultMeta?.headers,
      method,
    );
    if (staticRes) {
      response = staticRes;
    } else if (options.renderer) {
      response = await options.renderer.render({
        request: ctx.request,
        route: route as RouteArtifact,
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
      route: route as RouteArtifact,
      params: ctx.params,
      data: ctx.data,
      signal: ctx.signal,
    });
  } else {
    response = json(ctx.data);
  }

  if (
    !actionResponse &&
    !loaderResponse &&
    (actionInit !== undefined ||
      dataStatus !== undefined ||
      dataStatusText !== undefined ||
      !dataHeaders.keys().next().done)
  ) {
    const status = actionInit?.status ?? dataStatus ?? response.status;
    const statusText =
      actionInit?.statusText ?? dataStatusText ?? response.statusText;
    const headers = mergeHeaders(
      response.headers,
      dataHeaders,
      actionInit?.headers,
    );
    const bodyless = status === 204 || status === 205 || status === 304;
    if (bodyless) discardResponse(response);
    response = new Response(bodyless ? null : response.body, {
      status,
      statusText,
      headers,
    });
  }

  if (envelope && dataRequest) response = dataRequest.finalize(response);

  for (let i = chain.length - 1; i >= 0; i--) {
    for (const after of chain[i].module.after ?? []) {
      const previous = response;
      const next = async () => previous;
      try {
        response = await after(ctx, next);
      } catch (error) {
        discardReplacedResponse(
          previous,
          error instanceof Response ? error : undefined,
        );
        throw error;
      }
      discardReplacedResponse(previous, response);
    }
  }

  return response;
}

async function runBefores(
  ctx: RouteContext,
  index: number,
  befores: Middleware[],
  chain: ModuleChainItem[],
  options: RequestHandlerOptions,
  route: RouteDefinition,
  dataRequest: DataRequestPolicy | undefined,
): Promise<Response> {
  if (index >= befores.length) {
    return runCoreAndAfters(ctx, chain, options, route, dataRequest);
  }

  const mw = befores[index]!;
  const delivered: Response[] = [];
  let settled = false;
  let retained: Response | undefined;
  const next = () => {
    const pending = runBefores(
      ctx,
      index + 1,
      befores,
      chain,
      options,
      route,
      dataRequest,
    ).then(
      (response) => {
        if (settled) discardReplacedResponse(response, retained);
        else delivered.push(response);
        return response;
      },
      (error) => {
        if (error instanceof Response) {
          if (settled) discardReplacedResponse(error, retained);
          else delivered.push(error);
        }
        throw error;
      },
    );
    // A middleware may return before its next() settles; still observe rejection.
    void pending.catch(() => {});
    return pending;
  };
  try {
    retained = await mw(ctx, next);
    return retained;
  } catch (error) {
    retained = error instanceof Response ? error : undefined;
    throw error;
  } finally {
    settled = true;
    for (const response of delivered)
      discardReplacedResponse(response, retained);
  }
}

const NOT_FOUND_PATH = "/404";

/** A page's loader answered 404 without a body of its own. */
function isBareNotFound(
  response: Response,
  route: RouteDefinition,
  dataRequest: unknown,
): boolean {
  return (
    response.status === 404 &&
    response.body === null &&
    !dataRequest &&
    (route as Partial<RouteArtifact>).mode !== "api"
  );
}

export function createPipelineHandler(
  options: RequestHandlerOptions,
  policy?: DataRequestPolicy,
): (request: Request) => Promise<Response> {
  if (
    options.manifest?.requestContext &&
    typeof options.requestScope !== "function"
  ) {
    throw new Error(
      "Request-context manifests require their bundled requestScope",
    );
  }
  // Compiling the route graph is linear in the route count, so build it once
  // per handler instead of once per request.
  let cachedGraph = options.graph;

  /**
   * Like Waku's `404.tsx` and Next.js's `pages/404`, a page route at /404
   * renders unmatched GET and HEAD requests, and page requests whose loader
   * answers a bodiless 404 (Next.js's `notFound()`), with status 404 and the
   * page's own headers. An explicit `notFound` option takes precedence.
   */
  const notFoundPage = async (
    request: Request,
  ): Promise<Response | undefined> => {
    const { method } = request;
    const url = new URL(request.url);
    if (
      options.notFound ||
      (method !== "GET" && method !== "HEAD") ||
      (url.pathname.replace(/\/+$/, "") || "/") === NOT_FOUND_PATH
    )
      return undefined;
    const graph = cachedGraph;
    const page = graph ? matchRoutes(graph, NOT_FOUND_PATH) : undefined;
    if (
      !page ||
      page.route.path !== NOT_FOUND_PATH ||
      (page.route as Partial<RouteArtifact>).mode === "api"
    )
      return undefined;
    const response = await handler(
      new Request(new URL(NOT_FOUND_PATH, url), {
        method,
        headers: request.headers,
        signal: request.signal,
      }),
    );
    if (response.status === 200)
      return new Response(response.body, {
        status: 404,
        headers: response.headers,
      });
    await response.body?.cancel();
    return undefined;
  };

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;
    const dataRequest = policy?.matches(request) ? policy : undefined;

    if (
      !dataRequest &&
      options.staticDir &&
      (method === "GET" || method === "HEAD") &&
      pathname !== "/"
    ) {
      const staticRes = await tryServeStatic(
        options.staticDir,
        pathname,
        options.defaultMeta?.headers,
        method,
      );
      if (staticRes) return staticRes;
    }

    const graph = (cachedGraph ??= options.routes
      ? createRouteGraph(options.routes)
      : options.manifest
        ? createRouteGraph(options.manifest.routes)
        : undefined);
    if (!graph) {
      return finalizeResponse(
        new Response("No route graph configured", { status: 500 }),
        options.defaultMeta?.headers,
        method,
      );
    }

    const match = matchRoutes(graph, pathname);
    if (!match) {
      const page = dataRequest ? undefined : await notFoundPage(request);
      if (page) return page;
      const ctx = createRouteContext(request, {});
      return finalizeResponse(
        options.notFound
          ? await options.notFound(ctx)
          : new Response("Not Found", { status: 404 }),
        options.defaultMeta?.headers,
        method,
      );
    }

    const route = match.route;
    const ctx = createRouteContext(request, match.params);
    const chain = buildModuleChain(route, options.modules ?? {});
    const baseHeaders = resolveBaseHeaders(chain, route, options.defaultMeta);

    try {
      const befores: Middleware[] = [];
      for (const c of chain) befores.push(...(c.module.before ?? []));
      const response = await runBefores(
        ctx,
        0,
        befores,
        chain,
        options,
        route,
        dataRequest,
      );
      const page = isBareNotFound(response, route, dataRequest)
        ? await notFoundPage(request)
        : undefined;
      if (page) return page;
      return finalizeResponse(response, baseHeaders, method);
    } catch (error) {
      if (error instanceof Redirect) {
        if (!isSafeRedirect(error.location, request)) {
          return finalizeResponse(
            new Response("Invalid redirect", {
              status: 400,
              headers: baseHeaders,
            }),
            undefined,
            method,
          );
        }
        const headers = new Headers(baseHeaders);
        headers.set("location", error.location);
        return new Response(null, { status: error.status, headers });
      }

      const boundary = findErrorBoundary(chain, route, options.modules ?? {});
      if (boundary) {
        let res: Response;
        try {
          res = await boundary(ctx, error);
        } catch (boundaryError) {
          if (error instanceof Response)
            discardReplacedResponse(
              error,
              boundaryError instanceof Response ? boundaryError : undefined,
            );
          throw boundaryError;
        }
        if (error instanceof Response) discardReplacedResponse(error, res);
        return finalizeResponse(res, baseHeaders, method);
      }

      if (error instanceof Response) {
        const page = isBareNotFound(error, route, dataRequest)
          ? await notFoundPage(request)
          : undefined;
        if (page) return page;
        return finalizeResponse(error, baseHeaders, method);
      }

      return finalizeResponse(
        errorResponse(error, options.mode),
        baseHeaders,
        method,
      );
    }
  };
  const requestScope = options.requestScope;
  const scoped = requestScope
    ? (request: Request) => {
        const responseHeaders = new Headers();
        return requestScope(
          request,
          async () => {
            const response = await handler(request);
            return responseHeaders.keys().next().done
              ? response
              : finalizeResponse(response, responseHeaders, request.method);
          },
          responseHeaders,
        );
      }
    : handler;
  return scoped;
}

/** Private extension seam: wire protocols stay outside the ordinary server entry. */
export type DataRequestPolicy = {
  matches(request: Request): boolean;
  encode(data: unknown): Response;
  finalize(response: Response): Response;
};

export function createRequestHandler(options: RequestHandlerOptions) {
  if (options.dataRequests ?? options.manifest?.dataRequests) {
    throw new Error(
      "Route-data requests require @tschk/moonshine-server/data-http",
    );
  }
  return createPipelineHandler(options);
}
