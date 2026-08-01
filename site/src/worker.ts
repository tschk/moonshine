import { createRequestHandler } from "@tschk/moonshine-server";
import type { RouteModule } from "@tschk/moonshine-server";
import type {
  MoonshineManifest,
  RouteArtifact,
} from "@tschk/moonshine-framework";
import manifestJson from "../.moonshine/manifest.json" with { type: "json" };
import * as homeRoute from "./routes/index";
import * as packagesRoute from "./routes/packages";
import * as stateRoute from "./routes/api/state.server";
import { createSiteRenderer, type SiteModules } from "./renderer";

export type Env = {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

type RouteExports = {
  default?: unknown;
  loader?: (context: { request: Request }) => unknown;
  GET?: (request: Request) => Promise<Response> | Response;
};

/**
 * Cloudflare cannot resolve the `await import(absolutePath)` a renderer would
 * otherwise fall back to, so route modules are a static map — the same shape
 * `@tschk/moonshine-deploy-cloudflare` generates and feeds to
 * `registerRouteModules`. It is written out here so one bundler pass resolves
 * a single copy of React for both the route modules and the renderer.
 */
const SOURCES: Record<string, RouteExports> = {
  index: homeRoute,
  packages: packagesRoute,
  "api/state": stateRoute,
};

/** `GET` is the api-route convention; the pipeline drives `loader`. */
function toRouteModule(source: RouteExports): RouteExports {
  if (source.loader || !source.GET) return source;
  const { GET } = source;
  return { ...source, loader: (context) => GET(context.request) };
}

const modules = Object.fromEntries(
  Object.entries(SOURCES).map(([id, source]) => [id, toRouteModule(source)]),
) as Record<string, RouteModule & { default?: unknown }>;

const rendererModules: SiteModules = modules;

/**
 * Route file paths in the manifest are build-machine absolute; the worker only
 * ever looks modules up by route id, so they are collapsed to the id.
 */
const manifest: MoonshineManifest = {
  ...(manifestJson as unknown as MoonshineManifest),
  routes: (manifestJson as unknown as MoonshineManifest).routes.map(
    (route: RouteArtifact) => ({
      ...route,
      file: route.id,
      dataFile: undefined,
    }),
  ),
};

const handler = createRequestHandler({
  manifest,
  modules,
  renderer: createSiteRenderer(rendererModules),
});

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

const ASSET_PATH = /\.[a-z0-9]+$/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (
      env.ASSETS &&
      (request.method === "GET" || request.method === "HEAD") &&
      ASSET_PATH.test(pathname)
    ) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }

    const response = await handler(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
