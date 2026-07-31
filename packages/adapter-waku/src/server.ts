/**
 * Server surface for Waku apps on moonshine.
 *
 * Waku's `waku/server` (`getContext`, `unstable_getPlatformObject`) is tied to
 * its RSC pipeline and is not reimplemented — see the README.
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

/** JSON `Response` helper for API routes. */
export function json<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}
