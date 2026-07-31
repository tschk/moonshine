/**
 * Next.js server surface — Route Handlers / Server Actions helpers.
 * No client hooks.
 */
export {
  createMoonshineServer,
  definePage,
  handleMoonshineRequest,
  resolvePage,
  resolveStaticPath,
  toMoonshineRequest,
  tryServeStatic,
} from "@tschk/moonshine/server";
export type {
  MoonshinePageModule,
  MoonshineRequest,
  MoonshineServer,
  MoonshineServerOptions,
} from "@tschk/moonshine/server";

/** JSON Response helper for Route Handlers. */
export function moonshineJson(
  data: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** HTML Response helper. */
export function moonshineHtml(html: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }
  return new Response(html, { ...init, headers });
}

/**
 * Wrap an async handler for `app/api/.../route.ts`.
 *
 * ```ts
 * export const GET = moonshineRoute(async (req) => moonshineJson({ ok: true }));
 * ```
 */
export function moonshineRoute(
  handler: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return moonshineJson({ error: message }, { status: 500 });
    }
  };
}
