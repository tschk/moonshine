/**
 * Host-free Nitro / h3 server event utilities (`@tschk/moonshine-nuxt/server`).
 *
 * Implements event handler factories, URL/method/query/router-param helpers,
 * body/form-data readers, request/response header and cookie helpers, redirect
 * and cache-control helpers over standard Web `Request`/`Headers`/`Response`
 * and `NuxtRequestEvent` without `h3` or `nitropack` runtime dependencies.
 */

import {
  type CookieOptions,
  type NuxtRequestEvent,
  type NuxtRequestInit,
  createError,
  createNuxtRequestEvent,
  formatSetCookieHeader,
  isNuxtRequestEvent,
  parseRawCookies,
  setResponseStatus,
  useRequestEvent,
  withNuxtRequest,
} from "./composables";

export type EventHandlerRequest = Request | NuxtRequestEvent | NuxtRequestInit;
export type EventHandlerResponse<T = any> = T | Promise<T>;

export type EventHandler<
  _Request = EventHandlerRequest,
  ResponseT = EventHandlerResponse,
> = (event: NuxtRequestEvent) => ResponseT;

export interface EventHandlerObject<
  RequestT = EventHandlerRequest,
  ResponseT = EventHandlerResponse,
> {
  onRequest?:
    | Array<(event: NuxtRequestEvent) => void | Promise<void>>
    | ((event: NuxtRequestEvent) => void | Promise<void>);
  onBeforeResponse?:
    | Array<
        (
          event: NuxtRequestEvent,
          response: { body: unknown },
        ) => void | Promise<void>
      >
    | ((
        event: NuxtRequestEvent,
        response: { body: unknown },
      ) => void | Promise<void>);
  handler: EventHandler<RequestT, ResponseT>;
}

function resolveEvent(event?: NuxtRequestEvent | Request): NuxtRequestEvent {
  if (event) {
    return isNuxtRequestEvent(event) ? event : createNuxtRequestEvent(event);
  }
  const active = useRequestEvent();
  if (!active) {
    throw new Error(
      "No active NuxtRequestEvent found. Pass `event` explicitly or call inside `withNuxtRequest` / `defineEventHandler`.",
    );
  }
  return active;
}

export function isEvent(input: unknown): input is NuxtRequestEvent {
  return isNuxtRequestEvent(input);
}

export function defineEventHandler<
  RequestT = EventHandlerRequest,
  ResponseT = EventHandlerResponse,
>(
  handler:
    EventHandler<RequestT, ResponseT> | EventHandlerObject<RequestT, ResponseT>,
): (
  event: NuxtRequestEvent | Request | NuxtRequestInit,
) => Promise<Awaited<ResponseT>> {
  if (typeof handler === "function") {
    return (rawEvent: NuxtRequestEvent | Request | NuxtRequestInit) => {
      const event = createNuxtRequestEvent(rawEvent);
      return withNuxtRequest<Promise<Awaited<ResponseT>>>(
        event,
        (ev) => Promise.resolve(handler(ev)) as Promise<Awaited<ResponseT>>,
      );
    };
  }

  const onRequestList = handler.onRequest
    ? Array.isArray(handler.onRequest)
      ? handler.onRequest
      : [handler.onRequest]
    : [];
  const onBeforeResponseList = handler.onBeforeResponse
    ? Array.isArray(handler.onBeforeResponse)
      ? handler.onBeforeResponse
      : [handler.onBeforeResponse]
    : [];

  return (rawEvent: NuxtRequestEvent | Request | NuxtRequestInit) => {
    const event = createNuxtRequestEvent(rawEvent);
    return withNuxtRequest<Promise<Awaited<ResponseT>>>(
      event,
      (ev) =>
        (async () => {
          for (const hook of onRequestList) {
            await hook(ev);
          }
          const responseBox = { body: await handler.handler(ev) };
          for (const hook of onBeforeResponseList) {
            await hook(ev, responseBox);
          }
          return responseBox.body;
        })() as Promise<Awaited<ResponseT>>,
    );
  };
}

export const eventHandler = defineEventHandler;

export function defineLazyEventHandler<
  RequestT = EventHandlerRequest,
  ResponseT = EventHandlerResponse,
>(
  factory: () =>
    | Promise<
        | EventHandler<RequestT, ResponseT>
        | EventHandlerObject<RequestT, ResponseT>
      >
    | EventHandler<RequestT, ResponseT>
    | EventHandlerObject<RequestT, ResponseT>,
): (
  event: NuxtRequestEvent | Request | NuxtRequestInit,
) => Promise<Awaited<ResponseT>> {
  let resolvedPromise:
    | Promise<
        (
          event: NuxtRequestEvent | Request | NuxtRequestInit,
        ) => Promise<Awaited<ResponseT>>
      >
    | undefined;
  return (rawEvent: NuxtRequestEvent | Request | NuxtRequestInit) => {
    if (!resolvedPromise) {
      resolvedPromise = Promise.resolve(factory()).then((loaded) =>
        defineEventHandler(loaded),
      );
    }
    return resolvedPromise.then((handler) =>
      handler(createNuxtRequestEvent(rawEvent)),
    );
  };
}

export function getRequestURL(
  event?: NuxtRequestEvent,
  opts?: { xForwardedHost?: boolean; xForwardedProto?: boolean },
): URL {
  const ev = resolveEvent(event);
  const url = new URL(ev.url.href);
  if (opts?.xForwardedProto) {
    const proto = ev.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto) {
      url.protocol = proto.endsWith(":") ? proto : `${proto}:`;
    }
  }
  if (opts?.xForwardedHost) {
    const host = ev.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (host) {
      url.host = host;
    }
  }
  return url;
}

export function getMethod(
  event?: NuxtRequestEvent,
  defaultMethod = "GET",
): string {
  const ev = resolveEvent(event);
  return (ev.request.method || defaultMethod).toUpperCase();
}

export function isMethod(
  event: NuxtRequestEvent | undefined,
  expected: string | readonly string[],
  allowHead = false,
): boolean {
  const method = getMethod(event);
  if (allowHead && method === "HEAD") {
    return true;
  }
  if (typeof expected === "string") {
    return method === expected.toUpperCase();
  }
  return expected.some((m) => m.toUpperCase() === method);
}

export function assertMethod(
  event: NuxtRequestEvent | undefined,
  expected: string | readonly string[],
  allowHead = false,
): void {
  if (!isMethod(event, expected, allowHead)) {
    throw createError({
      statusCode: 405,
      statusMessage: "HTTP method is not allowed.",
    });
  }
}

export function getQuery<
  T extends Record<string, any> = Record<string, string | string[]>,
>(event?: NuxtRequestEvent): T {
  const ev = resolveEvent(event);
  const out: Record<string, string | string[]> = {};
  ev.url.searchParams.forEach((value, key) => {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      out[key] = [existing, value];
    }
  });
  return out as T;
}

export async function getValidatedQuery<T = any>(
  event: NuxtRequestEvent | undefined,
  validate: (data: Record<string, string | string[]>) => T | Promise<T>,
): Promise<T> {
  const query = getQuery(event);
  try {
    return await validate(query);
  } catch (cause) {
    throw createError({
      statusCode: 400,
      statusMessage: "Validation Error",
      message: cause instanceof Error ? cause.message : "Validation Error",
      data: cause,
      cause,
    });
  }
}

export function getRouterParams(
  event?: NuxtRequestEvent,
  opts: { decode?: boolean } = {},
): Record<string, string> {
  const ev = resolveEvent(event);
  const raw = (ev.context.params ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    const str = Array.isArray(v) ? v.map(String).join("/") : String(v);
    out[k] = opts.decode ? decodeURIComponent(str) : str;
  }
  return out;
}

export function getRouterParam(
  event: NuxtRequestEvent | undefined,
  name: string,
  opts: { decode?: boolean } = {},
): string | undefined {
  const params = getRouterParams(event, opts);
  return params[name];
}

export async function getValidatedRouterParams<T = any>(
  event: NuxtRequestEvent | undefined,
  validate: (data: Record<string, string>) => T | Promise<T>,
  opts: { decode?: boolean } = {},
): Promise<T> {
  const params = getRouterParams(event, opts);
  try {
    return await validate(params);
  } catch (cause) {
    throw createError({
      statusCode: 400,
      statusMessage: "Validation Error",
      message: cause instanceof Error ? cause.message : "Validation Error",
      data: cause,
      cause,
    });
  }
}

const rawBodyCache = new WeakMap<NuxtRequestEvent, Uint8Array>();
const parsedBodyCache = new WeakMap<NuxtRequestEvent, unknown>();

export async function readRawBody(
  event?: NuxtRequestEvent,
  encoding: "utf8" | "utf-8" | false = "utf-8",
): Promise<string | Uint8Array | undefined> {
  const ev = resolveEvent(event);
  const method = getMethod(ev);
  if (method === "GET" || method === "HEAD") {
    return undefined;
  }
  let bytes = rawBodyCache.get(ev);
  if (!bytes) {
    const buf = await ev.request.clone().arrayBuffer();
    bytes = new Uint8Array(buf);
    rawBodyCache.set(ev, bytes);
  }
  if (bytes.byteLength === 0) {
    return encoding === false ? bytes : "";
  }
  if (encoding === false) {
    return bytes;
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export async function readBody<T = any>(event?: NuxtRequestEvent): Promise<T> {
  const ev = resolveEvent(event);
  if (parsedBodyCache.has(ev)) {
    return parsedBodyCache.get(ev) as T;
  }
  if ("_body" in ev.context && ev.context._body !== undefined) {
    return ev.context._body as T;
  }
  const raw = (await readRawBody(ev, "utf-8")) as string | undefined;
  if (raw === undefined || raw === "") {
    return undefined as unknown as T;
  }
  const contentType = (ev.headers.get("content-type") ?? "").toLowerCase();
  let parsed: unknown = raw;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const obj: Record<string, string | string[]> = {};
    params.forEach((v, k) => {
      const existing = obj[k];
      if (existing === undefined) {
        obj[k] = v;
      } else if (Array.isArray(existing)) {
        existing.push(v);
      } else {
        obj[k] = [existing, v];
      }
    });
    parsed = obj;
  } else if (
    contentType.includes("application/json") ||
    contentType.includes("+json") ||
    raw.trim().startsWith("{") ||
    raw.trim().startsWith("[")
  ) {
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      if (
        contentType.includes("application/json") ||
        contentType.includes("+json")
      ) {
        throw createError({
          statusCode: 400,
          statusMessage: "Bad Request",
          message: "Invalid JSON body",
          cause,
        });
      }
    }
  }
  parsedBodyCache.set(ev, parsed);
  return parsed as T;
}

export async function readValidatedBody<T = any>(
  event: NuxtRequestEvent | undefined,
  validate: (data: any) => T | Promise<T>,
): Promise<T> {
  const body = await readBody(event);
  try {
    return await validate(body);
  } catch (cause) {
    throw createError({
      statusCode: 400,
      statusMessage: "Validation Error",
      message: cause instanceof Error ? cause.message : "Validation Error",
      data: cause,
      cause,
    });
  }
}

export async function readFormData(
  event?: NuxtRequestEvent,
): Promise<FormData> {
  const ev = resolveEvent(event);
  return ev.request.clone().formData();
}

export function getHeaders(
  event?: NuxtRequestEvent,
): Record<string, string | undefined> {
  const ev = resolveEvent(event);
  const out: Record<string, string | undefined> = {};
  ev.headers.forEach((val, key) => {
    out[key.toLowerCase()] = val;
  });
  return out;
}

export const getRequestHeaders = getHeaders;

export function getHeader(
  event: NuxtRequestEvent | undefined,
  name: string,
): string | undefined {
  const ev = resolveEvent(event);
  return ev.headers.get(name) ?? undefined;
}

export const getRequestHeader = getHeader;

export function setHeader(
  event: NuxtRequestEvent | undefined,
  name: string,
  value: string | number | readonly string[],
): void {
  const ev = resolveEvent(event);
  if (Array.isArray(value)) {
    ev.responseHeaders.delete(name);
    for (const item of value) {
      ev.responseHeaders.append(name, String(item));
    }
    return;
  }
  ev.responseHeaders.set(name, String(value));
}

export const setResponseHeader = setHeader;

export function setHeaders(
  event: NuxtRequestEvent | undefined,
  headers: Record<string, string | number | readonly string[]>,
): void {
  const ev = resolveEvent(event);
  for (const [name, value] of Object.entries(headers)) {
    setHeader(ev, name, value);
  }
}

export const setResponseHeaders = setHeaders;

export function appendHeader(
  event: NuxtRequestEvent | undefined,
  name: string,
  value: string | number | readonly string[],
): void {
  const ev = resolveEvent(event);
  if (Array.isArray(value)) {
    for (const item of value) {
      ev.responseHeaders.append(name, String(item));
    }
    return;
  }
  ev.responseHeaders.append(name, String(value));
}

export const appendResponseHeader = appendHeader;

export function removeResponseHeader(
  event: NuxtRequestEvent | undefined,
  name: string,
): void {
  const ev = resolveEvent(event);
  ev.responseHeaders.delete(name);
}

export function getResponseHeader(
  event: NuxtRequestEvent | undefined,
  name: string,
): string | string[] | undefined {
  const ev = resolveEvent(event);
  if (
    name.toLowerCase() === "set-cookie" &&
    "getSetCookie" in ev.responseHeaders
  ) {
    const cookies = ev.responseHeaders.getSetCookie();
    return cookies.length > 0 ? cookies : undefined;
  }
  return ev.responseHeaders.get(name) ?? undefined;
}

export function getResponseHeaders(
  event?: NuxtRequestEvent,
): Record<string, string | string[]> {
  const ev = resolveEvent(event);
  const out: Record<string, string | string[]> = {};
  ev.responseHeaders.forEach((val, key) => {
    out[key.toLowerCase()] = val;
  });
  if ("getSetCookie" in ev.responseHeaders) {
    const cookies = ev.responseHeaders.getSetCookie();
    if (cookies.length > 0) {
      out["set-cookie"] = cookies;
    }
  }
  return out;
}

export function parseCookies(event?: NuxtRequestEvent): Record<string, string> {
  const ev = resolveEvent(event);
  const raw = ev.headers.get("cookie") ?? "";
  const map = parseRawCookies(raw);
  const out: Record<string, string> = {};
  for (const [k, v] of map.entries()) {
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function getCookie(
  event: NuxtRequestEvent | undefined,
  name: string,
): string | undefined {
  return parseCookies(event)[name];
}

export function setCookie(
  event: NuxtRequestEvent | undefined,
  name: string,
  value: string,
  serializeOptions: CookieOptions<string> = {},
): void {
  const ev = resolveEvent(event);
  const header = formatSetCookieHeader(name, value, serializeOptions);
  ev.responseHeaders.append("Set-Cookie", header);
}

export function deleteCookie(
  event: NuxtRequestEvent | undefined,
  name: string,
  serializeOptions: CookieOptions<string> = {},
): void {
  const ev = resolveEvent(event);
  const header = formatSetCookieHeader(name, null, {
    ...serializeOptions,
    maxAge: 0,
  });
  ev.responseHeaders.append("Set-Cookie", header);
}

export function getResponseStatus(event?: NuxtRequestEvent): number {
  const ev = resolveEvent(event);
  return ev.responseStatus;
}

export function getResponseStatusText(event?: NuxtRequestEvent): string {
  const ev = resolveEvent(event);
  return ev.responseStatusText ?? "";
}

export function sendRedirect(
  event: NuxtRequestEvent | undefined,
  location: string,
  code = 302,
): Response {
  const ev = resolveEvent(event);
  setResponseStatus(ev, code);
  ev.responseHeaders.set("Location", location);
  return new Response(null, {
    status: code,
    headers: ev.responseHeaders,
  });
}

export function sendNoContent(event?: NuxtRequestEvent, code = 204): Response {
  const ev = resolveEvent(event);
  setResponseStatus(ev, code);
  return new Response(null, {
    status: code,
    headers: ev.responseHeaders,
  });
}

export interface CacheHeadersOptions {
  maxAge?: number;
  modifiedTime?: Date | string | number;
  etag?: string;
  cacheControls?: string[];
}

export function handleCacheHeaders(
  event: NuxtRequestEvent | undefined,
  opts: CacheHeadersOptions,
): boolean {
  const ev = resolveEvent(event);
  const cacheControls = ["public", ...(opts.cacheControls ?? [])];
  let cacheMatched = false;

  if (opts.maxAge !== undefined) {
    cacheControls.push(`max-age=${+opts.maxAge}`, `s-maxage=${+opts.maxAge}`);
  }

  if (opts.modifiedTime) {
    const modifiedDate = new Date(opts.modifiedTime);
    const ifModifiedSince = ev.headers.get("if-modified-since");
    ev.responseHeaders.set("Last-Modified", modifiedDate.toUTCString());
    if (ifModifiedSince && new Date(ifModifiedSince) >= modifiedDate) {
      cacheMatched = true;
    }
  }

  if (opts.etag) {
    ev.responseHeaders.set("ETag", opts.etag);
    const ifNoneMatch = ev.headers.get("if-none-match");
    if (ifNoneMatch === opts.etag) {
      cacheMatched = true;
    }
  }

  ev.responseHeaders.set("Cache-Control", cacheControls.join(", "));

  if (cacheMatched) {
    setResponseStatus(ev, 304);
    return true;
  }
  return false;
}
