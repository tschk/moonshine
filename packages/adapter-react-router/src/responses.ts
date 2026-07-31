/**
 * Loader/action return helpers. These are plain `Response` builders in
 * react-router, so they carry over unchanged.
 *
 * ```ts
 * export async function loader() {
 *   return json({ ok: true });
 * }
 * ```
 */
/** JSON response for a loader or action. */
export function json<T>(data: T, init: ResponseInit | number = {}): Response {
  const options = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(options.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...options, headers });
}

/** `data()` in react-router v7 — payload plus response init, no serialisation. */
export function data<T>(
  value: T,
  init: ResponseInit | number = {},
): { type: "DataWithResponseInit"; data: T; init: ResponseInit } {
  return {
    type: "DataWithResponseInit",
    data: value,
    init: typeof init === "number" ? { status: init } : init,
  };
}

/** 302 (or given status) redirect response. */
export function redirect(
  url: string,
  init: ResponseInit | number = 302,
): Response {
  const options = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(options.headers);
  headers.set("location", url);
  return new Response(null, {
    ...options,
    status: options.status ?? 302,
    headers,
  });
}

/** 301 redirect. */
export function redirectDocument(url: string): Response {
  const response = redirect(url, 302);
  response.headers.set("x-remix-reload-document", "true");
  return response;
}

export function replace(
  url: string,
  init: ResponseInit | number = 302,
): Response {
  const response = redirect(url, init);
  response.headers.set("x-remix-replace", "true");
  return response;
}

export class ErrorResponse extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly data: unknown,
  ) {
    super(`${status} ${statusText}`);
    this.name = "ErrorResponse";
  }
}

export function isRouteErrorResponse(error: unknown): error is ErrorResponse {
  return error instanceof ErrorResponse;
}
