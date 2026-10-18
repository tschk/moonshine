import {
  normalizeRouteDataRequests,
  ROUTE_DATA_HEADER,
  ROUTE_DATA_VERSION,
} from "@tschk/moonshine-framework/data-request";
import type { RequestHandlerOptions } from "./data.js";
import { json } from "./errors.js";
import { createPipelineHandler } from "./pipeline.js";

/** Opt-in HTTP route-data transport over the ordinary request pipeline. */
export function createRequestHandler(options: RequestHandlerOptions) {
  const configured = options.dataRequests;
  const config = normalizeRouteDataRequests(
    configured !== undefined ? configured : options.manifest?.dataRequests,
  );
  if (!config) return createPipelineHandler(options);
  const publicOrigin = typeof config === "object" ? config.origin : undefined;
  const handler = createPipelineHandler(options, {
    matches,
    encode: (data) => json({ data }),
    finalize(response) {
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set(ROUTE_DATA_HEADER, ROUTE_DATA_VERSION);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  });
  return async (request: Request) => {
    const rejection = matches(request)
      ? rejectDataRequest(request, publicOrigin)
      : undefined;
    // Guard before request scope or application callbacks; preserve HEAD semantics.
    return withDataVary(
      rejection
        ? new Response(
            request.method === "HEAD" ? null : rejection.body,
            rejection,
          )
        : await handler(request),
    );
  };
}

function matches(request: Request): boolean {
  return request.headers.get(ROUTE_DATA_HEADER) === ROUTE_DATA_VERSION;
}

const DATA_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

function rejectDataRequest(
  request: Request,
  publicOrigin?: string,
): Response | undefined {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let valid = false;
    try {
      const parsed = new URL(origin);
      valid =
        origin === parsed.origin &&
        parsed.origin === (publicOrigin ?? new URL(request.url).origin);
    } catch {
      valid = false;
    }
    if (!valid) return new Response("Forbidden", { status: 403 });
  } else {
    const site = request.headers.get("sec-fetch-site");
    if (site === "cross-site" || site === "same-site") {
      return new Response("Forbidden", { status: 403 });
    }
  }
  if (!DATA_METHODS.has(request.method)) {
    return new Response(null, {
      status: 405,
      headers: { allow: "GET, HEAD, POST, PUT, PATCH, DELETE" },
    });
  }
  return undefined;
}

function withDataVary(response: Response): Response {
  const current = response.headers.get("vary");
  if (current !== null) {
    const tokens = current
      .split(",")
      .map((token) => token.trim().toLowerCase());
    if (tokens.includes("*") || tokens.includes(ROUTE_DATA_HEADER)) {
      return response;
    }
  }
  const headers = new Headers(response.headers);
  headers.set(
    "vary",
    current ? `${current}, ${ROUTE_DATA_HEADER}` : ROUTE_DATA_HEADER,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
