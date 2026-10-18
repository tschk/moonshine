/** Opt-in route-data wire contract; no server or renderer imports. */
export const ROUTE_DATA_HEADER = "x-moonshine-data";
export const ROUTE_DATA_VERSION = "1";

/** JSON response payload; applications validate the decoded data. */
export type RouteDataPayload = { data: unknown };

/** Expected public origin can be explicit when a TLS proxy fronts the server. */
export type RouteDataRequests = boolean | { origin: string };

/** Validate configured origins without trusting request forwarding headers. */
export function normalizeRouteDataOrigin(value: string): string {
  if (typeof value !== "string" || value === "")
    throw new TypeError("Invalid route-data origin");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Invalid route-data origin");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new TypeError(
      "Route-data origin must be an http(s) origin without credentials, path, query or hash",
    );
  }
  return url.origin;
}

/** Normalize JS/JSON configuration before it enables a client-visible endpoint. */
export function normalizeRouteDataRequests(
  value: unknown,
): RouteDataRequests | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.hasOwn(value, "origin") ||
    Object.keys(value).some((key) => key !== "origin")
  ) {
    throw new TypeError(
      "dataRequests must be a boolean or an object containing only a string origin",
    );
  }
  const origin = Reflect.get(value, "origin");
  if (typeof origin !== "string")
    throw new TypeError("dataRequests must contain a string origin");
  return { origin: normalizeRouteDataOrigin(origin) };
}
