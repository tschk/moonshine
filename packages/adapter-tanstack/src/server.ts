/**
 * Server surface for TanStack Start apps on moonshine: response helpers plus
 * moonshine's request handling.
 *
 * `createServerFn` is deliberately absent — see the README.
 */
export {
  createMoonshineServer,
  definePage,
  handleMoonshineRequest,
  resolvePage,
  toMoonshineRequest,
} from "@tschk/moonshine/server";
export type {
  MoonshinePageModule,
  MoonshineRequest,
  MoonshineServer,
} from "@tschk/moonshine/server";

/** `json()` from `@tanstack/react-start`. */
export function json<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * Wrap a server route handler.
 *
 * ```ts
 * export const GET = createServerRoute(async (req) => json({ ok: true }));
 * ```
 */
export function createServerRoute(
  handler: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return json({ error: message }, { status: 500 });
    }
  };
}
