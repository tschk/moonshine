import {
  normalizeRouteDataOrigin,
  ROUTE_DATA_HEADER,
  ROUTE_DATA_VERSION,
} from "@tschk/moonshine-framework/data-request";
import type { RouteDataContext } from "./data";

export type RouteDataClientOptions = {
  origin?: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export type RouteDataActionMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteDataActionInit = Omit<
  RequestInit,
  "method" | "signal" | "credentials" | "redirect" | "mode"
> & { method: RouteDataActionMethod };

export type RouteDataClient = {
  load(context: RouteDataContext): Promise<unknown>;
  action(
    context: RouteDataContext,
    init: RouteDataActionInit,
  ): Promise<unknown>;
};

const ACTION_METHODS: Record<string, true> = {
  POST: true,
  PUT: true,
  PATCH: true,
  DELETE: true,
};

function resolveOrigin(value: string | undefined): string {
  const raw =
    value ??
    ("location" in globalThis ? globalThis.location?.origin : undefined);
  if (typeof raw !== "string" || raw === "") {
    throw new TypeError(
      "createRouteDataClient requires an absolute http(s) origin; pass options.origin when no browser location exists",
    );
  }
  return normalizeRouteDataOrigin(raw);
}

function resolveLocation(origin: string, location: string): string {
  let url: URL;
  try {
    url = new URL(location, origin);
  } catch {
    throw new TypeError("Invalid route-data location");
  }
  if (url.origin !== origin || url.username !== "" || url.password !== "") {
    throw new TypeError(
      `Route-data location must be within origin ${origin} and without credentials`,
    );
  }
  url.hash = "";
  return url.href;
}

function isJson(response: Response): boolean {
  const type = response.headers.get("content-type");
  return type !== null && /^\s*application\/json\s*(;|$)/i.test(type);
}

function reject(response: Response, message: string): never {
  try {
    void response.body?.cancel().catch(() => {});
  } catch {}
  throw new TypeError(message);
}

async function decode(response: Response): Promise<unknown> {
  if (!response.ok) throw response;
  if (response.headers.get(ROUTE_DATA_HEADER) !== ROUTE_DATA_VERSION) {
    return reject(
      response,
      `Route-data response is missing ${ROUTE_DATA_HEADER}: ${ROUTE_DATA_VERSION}`,
    );
  }
  if (!isJson(response)) {
    return reject(response, "Route-data response is not application/json");
  }
  if (response.status === 204 || response.status === 205) return null;
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new TypeError("Route-data response body is not valid JSON", {
        cause: error,
      });
    throw error;
  }
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("data" in body) ||
    !Object.hasOwn(body, "data")
  ) {
    throw new TypeError(
      "Route-data response must be an object envelope with an own data field",
    );
  }
  return body.data;
}

export function createRouteDataClient(
  options: RouteDataClientOptions = {},
): RouteDataClient {
  const origin = resolveOrigin(options.origin);
  const doFetch: NonNullable<RouteDataClientOptions["fetch"]> =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function send(
    context: RouteDataContext,
    method: string,
    init: Omit<
      RequestInit,
      "method" | "signal" | "credentials" | "redirect" | "mode"
    >,
  ): Promise<unknown> {
    context.signal.throwIfAborted();
    const url = resolveLocation(origin, context.location);
    const headers = new Headers(init.headers);
    headers.set(ROUTE_DATA_HEADER, ROUTE_DATA_VERSION);
    const response = await doFetch(url, {
      ...init,
      method,
      headers,
      signal: context.signal,
      credentials: "same-origin",
      mode: "same-origin",
      redirect: "error",
    });
    return decode(response);
  }

  return {
    load(context) {
      return send(context, "GET", {});
    },
    action(context, init) {
      const method =
        typeof init?.method === "string" ? init.method.toUpperCase() : "";
      if (!Object.hasOwn(ACTION_METHODS, method)) {
        return Promise.reject(
          new TypeError(
            "Route-data action method must be POST, PUT, PATCH or DELETE",
          ),
        );
      }
      const { method: _method, ...rest } = init;
      return send(context, method, rest);
    },
  };
}
