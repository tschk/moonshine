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

// ============================================================================
// Request Host / Protocol / IP / Fingerprint / Send / Multipart / Stream / SSE
// ============================================================================

export function getRequestHost(
  event?: NuxtRequestEvent,
  opts?: { xForwardedHost?: boolean },
): string {
  const ev = resolveEvent(event);
  if (opts?.xForwardedHost) {
    const forwarded = ev.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return ev.headers.get("host") ?? ev.url.host ?? "localhost";
}

export function getRequestProtocol(
  event?: NuxtRequestEvent,
  opts?: { xForwardedProto?: boolean },
): "http" | "https" | string {
  const ev = resolveEvent(event);
  if (opts?.xForwardedProto !== false) {
    const forwarded = ev.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    if (forwarded) return forwarded.replace(/:$/, "");
  }
  return ev.url.protocol.replace(/:$/, "") || "http";
}

export function getRequestIP(
  event?: NuxtRequestEvent,
  opts?: { xForwardedFor?: boolean },
): string | undefined {
  const ev = resolveEvent(event);
  if (opts?.xForwardedFor) {
    const xff = ev.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
    const realIp = ev.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  const ctxIp = ev.context.clientAddress ?? ev.context.ip;
  return typeof ctxIp === "string" ? ctxIp : undefined;
}

export async function getRequestFingerprint(
  event?: NuxtRequestEvent,
  opts: {
    ip?: boolean;
    xForwardedFor?: boolean;
    method?: boolean;
    path?: boolean;
    userAgent?: boolean;
    hash?: "sha-256" | false;
  } = {},
): Promise<string | null> {
  const ev = resolveEvent(event);
  const parts: unknown[] = [];
  if (opts.ip !== false) {
    parts.push(getRequestIP(ev, { xForwardedFor: opts.xForwardedFor ?? true }));
  }
  if (opts.method) {
    parts.push(getMethod(ev));
  }
  if (opts.path) {
    parts.push(ev.path || ev.url.pathname);
  }
  if (opts.userAgent) {
    parts.push(ev.headers.get("user-agent"));
  }
  const filtered = parts.filter((p) => Boolean(p));
  if (filtered.length === 0) {
    return null;
  }
  const raw = filtered.join("|");
  if (opts.hash === false) {
    return raw;
  }
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function defaultContentType(
  event: NuxtRequestEvent | undefined,
  type?: string,
): void {
  const ev = resolveEvent(event);
  if (type && !ev.responseHeaders.has("content-type")) {
    ev.responseHeaders.set("content-type", type);
  }
}

export function send(
  event: NuxtRequestEvent | undefined,
  data?: BodyInit | null,
  type?: string,
): Response {
  const ev = resolveEvent(event);
  if (type) {
    defaultContentType(ev, type);
  }
  return new Response(data ?? null, {
    status: ev.responseStatus,
    statusText: ev.responseStatusText,
    headers: ev.responseHeaders,
  });
}

export function sendStream(
  event: NuxtRequestEvent | undefined,
  stream: ReadableStream,
): Response {
  const ev = resolveEvent(event);
  return new Response(stream, {
    status: ev.responseStatus,
    statusText: ev.responseStatusText,
    headers: ev.responseHeaders,
  });
}

export function sendError(
  event: NuxtRequestEvent | undefined,
  error: Error | { statusCode?: number; statusMessage?: string; data?: any },
  debug = false,
): Response {
  const ev = resolveEvent(event);
  const h3Err = createError(error as any);
  const statusCode = h3Err.statusCode || 500;
  setResponseStatus(ev, statusCode, h3Err.statusMessage);
  ev.responseHeaders.set("content-type", "application/json; charset=utf-8");
  const payload: Record<string, unknown> = {
    statusCode,
    statusMessage: h3Err.statusMessage,
    message: h3Err.message,
    data: h3Err.data,
  };
  if (debug && h3Err.stack) {
    payload.stack = h3Err.stack.split("\n").map((l) => l.trim());
  }
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    statusText: h3Err.statusMessage,
    headers: ev.responseHeaders,
  });
}

export interface MultiPartData {
  name?: string;
  filename?: string;
  type?: string;
  data: Uint8Array;
}

export async function readMultipartFormData(
  event?: NuxtRequestEvent,
): Promise<MultiPartData[] | undefined> {
  const ev = resolveEvent(event);
  const contentType = ev.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return undefined;
  }
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;,\s]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (boundary && ev.request) {
    try {
      const cloned = ev.request.clone();
      const rawText = await cloned.text();
      const delimiter = `--${boundary}`;
      if (rawText.includes(delimiter)) {
        const segments = rawText.split(delimiter);
        const parsed: MultiPartData[] = [];
        const encoder = new TextEncoder();
        for (let i = 1; i < segments.length; i++) {
          let seg = segments[i]!;
          if (seg.startsWith("--")) break;
          if (seg.startsWith("\r\n")) seg = seg.slice(2);
          else if (seg.startsWith("\n")) seg = seg.slice(1);
          if (seg.endsWith("\r\n")) seg = seg.slice(0, -2);
          else if (seg.endsWith("\n")) seg = seg.slice(0, -1);

          const sepIdx = seg.indexOf("\r\n\r\n");
          const altSepIdx = sepIdx === -1 ? seg.indexOf("\n\n") : -1;
          const headerEnd = sepIdx !== -1 ? sepIdx : altSepIdx;
          if (headerEnd === -1) continue;
          const headerBlock = seg.slice(0, headerEnd);
          const bodyStr = seg.slice(headerEnd + (sepIdx !== -1 ? 4 : 2));

          let partName: string | undefined;
          let filename: string | undefined;
          let partType: string | undefined;
          for (const line of headerBlock.split(/\r?\n/)) {
            const colon = line.indexOf(":");
            if (colon === -1) continue;
            const hKey = line.slice(0, colon).trim().toLowerCase();
            const hVal = line.slice(colon + 1).trim();
            if (hKey === "content-disposition") {
              const nameMatch = /\bname="([^"]*)"/i.exec(hVal);
              if (nameMatch) partName = nameMatch[1];
              const fileMatch = /\bfilename="([^"]*)"/i.exec(hVal);
              if (fileMatch) filename = fileMatch[1];
            } else if (hKey === "content-type") {
              partType = hVal;
            }
          }
          parsed.push({
            name: partName,
            ...(filename !== undefined ? { filename } : {}),
            ...(partType !== undefined ? { type: partType } : {}),
            data: encoder.encode(bodyStr),
          });
        }
        if (parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fall back to readFormData
    }
  }
  const formData = await readFormData(ev);
  const items: MultiPartData[] = [];
  for (const [name, entry] of formData.entries()) {
    if (typeof entry === "string") {
      items.push({
        name,
        data: new TextEncoder().encode(entry),
      });
    } else if (entry && typeof (entry as Blob).arrayBuffer === "function") {
      const file = entry as File;
      const buf = await file.arrayBuffer();
      items.push({
        name,
        filename: typeof file.name === "string" ? file.name : undefined,
        type: file.type || undefined,
        data: new Uint8Array(buf),
      });
    }
  }
  return items;
}

export interface EventStreamMessage {
  id?: string;
  event?: string;
  retry?: number;
  data: string;
}

export interface EventStreamOptions {
  autoclose?: boolean;
}

export interface EventStream {
  push(
    message: string | string[] | EventStreamMessage | EventStreamMessage[],
  ): Promise<void>;
  send(): Response;
  close(): Promise<void>;
  onClosed(cb: () => any): void;
}

function formatSSEMessage(msg: string | EventStreamMessage): string {
  if (typeof msg === "string") {
    return `data: ${msg.split(/\r?\n/).join("\ndata: ")}\n\n`;
  }
  let out = "";
  if (msg.id !== undefined) {
    out += `id: ${msg.id}\n`;
  }
  if (msg.event !== undefined) {
    out += `event: ${msg.event}\n`;
  }
  if (typeof msg.retry === "number") {
    out += `retry: ${msg.retry}\n`;
  }
  const lines = String(msg.data ?? "").split(/\r?\n/);
  for (const line of lines) {
    out += `data: ${line}\n`;
  }
  out += "\n";
  return out;
}

export function createEventStream(
  event?: NuxtRequestEvent,
  _opts?: EventStreamOptions,
): EventStream {
  const ev = resolveEvent(event);
  const encoder = new TextEncoder();
  const closedListeners = new Set<() => any>();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  const buffered: Uint8Array[] = [];

  const notifyClosed = () => {
    for (const cb of closedListeners) {
      try {
        cb();
      } catch {
        // Ignore callback errors
      }
    }
    closedListeners.clear();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      while (buffered.length > 0) {
        const chunk = buffered.shift()!;
        controller.enqueue(chunk);
      }
      if (closed) {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
    cancel() {
      closed = true;
      notifyClosed();
    },
  });

  return {
    async push(message) {
      if (closed) return;
      const list = Array.isArray(message) ? message : [message];
      const payload = list.map((item) => formatSSEMessage(item)).join("");
      const bytes = encoder.encode(payload);
      if (controllerRef) {
        controllerRef.enqueue(bytes);
      } else {
        buffered.push(bytes);
      }
    },
    send() {
      setResponseHeader(ev, "Content-Type", "text/event-stream");
      setResponseHeader(
        ev,
        "Cache-Control",
        "private, no-cache, no-store, no-transform, must-revalidate, max-age=0",
      );
      setResponseHeader(ev, "Connection", "keep-alive");
      setResponseStatus(ev, 200);
      return sendStream(ev, stream);
    },
    async close() {
      if (closed) return;
      closed = true;
      if (controllerRef) {
        try {
          controllerRef.close();
        } catch {
          // Ignore close error
        }
      }
      notifyClosed();
    },
    onClosed(cb) {
      if (closed) {
        cb();
      } else {
        closedListeners.add(cb);
      }
    },
  };
}

// ============================================================================
// Proxy Utilities (`proxyRequest`, `sendProxy`)
// ============================================================================

export interface ProxyOptions {
  headers?: Record<string, string> | Headers;
  fetchOptions?: RequestInit;
  fetch?: typeof fetch;
  sendStream?: boolean;
  cookieDomainRewrite?: string | Record<string, string>;
  cookiePathRewrite?: string | Record<string, string>;
}

export async function proxyRequest(
  event: NuxtRequestEvent | undefined,
  target: string,
  opts: ProxyOptions = {},
): Promise<Response> {
  const ev = resolveEvent(event);
  const method = getMethod(ev);
  const headers = new Headers(ev.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  if (opts.headers) {
    const extra = new Headers(opts.headers);
    extra.forEach((v, k) => headers.set(k, v));
  }

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const raw = await readRawBody(ev, false);
    if (
      raw &&
      (typeof raw === "string" ? raw.length > 0 : raw.byteLength > 0)
    ) {
      body = raw as unknown as BodyInit;
    }
  }

  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const upstream = await fetchImpl(target, {
    method,
    headers,
    body,
    redirect: "manual",
    ...opts.fetchOptions,
  });

  setResponseStatus(ev, upstream.status, upstream.statusText);
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "transfer-encoding" ||
      lower === "content-encoding" ||
      lower === "content-length"
    ) {
      return;
    }
    ev.responseHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: ev.responseHeaders,
  });
}

export const sendProxy = proxyRequest;

// ============================================================================
// CORS Utilities (`handleCors`, `appendCorsHeaders`, `isPreflightRequest`)
// ============================================================================

export interface H3CorsOptions {
  origin?:
    "*" | "null" | Array<string | RegExp> | ((origin: string) => boolean);
  methods?: "*" | string[];
  allowHeaders?: "*" | string[];
  exposeHeaders?: "*" | string[];
  credentials?: boolean;
  maxAge?: string | false;
  preflight?: {
    statusCode?: number;
  };
}

export function isPreflightRequest(event?: NuxtRequestEvent): boolean {
  const ev = resolveEvent(event);
  const origin = ev.headers.get("origin");
  const accessControlRequestMethod = ev.headers.get(
    "access-control-request-method",
  );
  return (
    getMethod(ev) === "OPTIONS" &&
    Boolean(origin) &&
    Boolean(accessControlRequestMethod)
  );
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  options: H3CorsOptions = {},
): boolean {
  const { origin: originOption = "*" } = options;
  if (!origin) {
    return false;
  }
  if (originOption === "*") {
    return true;
  }
  if (originOption === "null") {
    return origin === "null";
  }
  if (typeof originOption === "function") {
    return originOption(origin);
  }
  if (Array.isArray(originOption)) {
    return originOption.some((pattern) =>
      pattern instanceof RegExp ? pattern.test(origin) : pattern === origin,
    );
  }
  return false;
}

export function appendCorsHeaders(
  event: NuxtRequestEvent | undefined,
  options: H3CorsOptions = {},
): void {
  const ev = resolveEvent(event);
  const origin = ev.headers.get("origin") ?? undefined;
  const originOption = options.origin ?? "*";

  if (originOption === "*" && !options.credentials) {
    setResponseHeader(ev, "access-control-allow-origin", "*");
  } else if (origin && isCorsOriginAllowed(origin, options)) {
    setResponseHeader(ev, "access-control-allow-origin", origin);
    appendResponseHeader(ev, "vary", "Origin");
  }

  if (options.credentials) {
    setResponseHeader(ev, "access-control-allow-credentials", "true");
  }

  if (options.exposeHeaders) {
    const exposed =
      options.exposeHeaders === "*" ? "*" : options.exposeHeaders.join(", ");
    setResponseHeader(ev, "access-control-expose-headers", exposed);
  }
}

export function appendCorsPreflightHeaders(
  event: NuxtRequestEvent | undefined,
  options: H3CorsOptions = {},
): void {
  const ev = resolveEvent(event);
  appendCorsHeaders(ev, options);

  const methods =
    options.methods === "*" || !options.methods
      ? "GET, HEAD, PUT, PATCH, POST, DELETE"
      : options.methods.join(", ");
  setResponseHeader(ev, "access-control-allow-methods", methods);

  if (options.allowHeaders === "*" || !options.allowHeaders) {
    const reqHeaders = ev.headers.get("access-control-request-headers");
    if (reqHeaders) {
      setResponseHeader(ev, "access-control-allow-headers", reqHeaders);
      appendResponseHeader(ev, "vary", "Access-Control-Request-Headers");
    } else if (options.allowHeaders === "*") {
      setResponseHeader(ev, "access-control-allow-headers", "*");
    }
  } else if (Array.isArray(options.allowHeaders)) {
    setResponseHeader(
      ev,
      "access-control-allow-headers",
      options.allowHeaders.join(", "),
    );
  }

  if (options.maxAge) {
    setResponseHeader(ev, "access-control-max-age", options.maxAge);
  }
}

export function handleCors(
  event: NuxtRequestEvent | undefined,
  options: H3CorsOptions = {},
): boolean {
  const ev = resolveEvent(event);
  if (isPreflightRequest(ev)) {
    appendCorsPreflightHeaders(ev, options);
    setResponseStatus(ev, options.preflight?.statusCode ?? 204);
    return true;
  }
  appendCorsHeaders(ev, options);
  return false;
}

// ============================================================================
//Encrypted / Signed Server Sessions (`useSession`, `getSession`, `updateSession`, `clearSession`)
// ============================================================================

export type SessionDataT = Record<string, any>;

export interface Session<T extends SessionDataT = SessionDataT> {
  id: string;
  createdAt: number;
  data: T;
}

export interface SessionConfig {
  /** Secret password (at least 32 characters recommended in production) */
  password: string;
  /** Session expiration time in seconds */
  maxAge?: number;
  /** Default cookie name is 'h3' */
  name?: string;
  /** Cookie serialization options (defaults: path: '/', httpOnly: true, secure: true) */
  cookie?: false | CookieOptions<string>;
  /** Custom session ID generator */
  generateId?: () => string;
}

export type SessionUpdate<T extends SessionDataT = SessionDataT> =
  Partial<T> | ((oldData: T) => Partial<T> | undefined);

export interface SessionManager<T extends SessionDataT = SessionDataT> {
  readonly id: string | undefined;
  readonly data: T;
  readonly ready: Promise<SessionManager<T>>;
  update(update: SessionUpdate<T>): Promise<SessionManager<T>>;
  clear(): Promise<SessionManager<T>>;
}

const DEFAULT_SESSION_NAME = "h3";
const DEFAULT_SESSION_COOKIE: CookieOptions<string> = {
  path: "/",
  secure: true,
  httpOnly: true,
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveSessionKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(password),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealSession<T extends SessionDataT = SessionDataT>(
  session: Session<T>,
  config: SessionConfig,
): Promise<string> {
  const key = await deriveSessionKey(config.password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(session));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function unsealSession<T extends SessionDataT = SessionDataT>(
  sealed: string,
  config: SessionConfig,
): Promise<Session<T> | null> {
  try {
    const parts = sealed.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") {
      return null;
    }
    const iv = base64UrlToBytes(parts[1]!);
    const cipherBytes = base64UrlToBytes(parts[2]!);
    const key = await deriveSessionKey(config.password);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource,
    );
    const json = new TextDecoder().decode(new Uint8Array(decrypted));
    const parsed = JSON.parse(json) as Session<T>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (config.maxAge && parsed.createdAt) {
      const expiresAt = parsed.createdAt + config.maxAge * 1000;
      if (Date.now() > expiresAt) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession<T extends SessionDataT = SessionDataT>(
  event: NuxtRequestEvent | undefined,
  config: SessionConfig,
): Promise<Session<T>> {
  const ev = resolveEvent(event);
  const sessionName = config.name || DEFAULT_SESSION_NAME;
  if (!ev.context.sessions) {
    ev.context.sessions = {};
  }
  const sessionsMap = ev.context.sessions as Record<string, Session<any>>;
  if (sessionsMap[sessionName]) {
    return sessionsMap[sessionName] as Session<T>;
  }

  let session: Session<T> | null = null;
  if (config.cookie !== false) {
    const rawCookie = getCookie(ev, sessionName);
    if (rawCookie) {
      session = await unsealSession<T>(rawCookie, config);
    }
  }

  if (!session) {
    session = {
      id: config.generateId ? config.generateId() : crypto.randomUUID(),
      createdAt: Date.now(),
      data: Object.create(null) as T,
    };
  }

  sessionsMap[sessionName] = session;
  return session;
}

export async function updateSession<T extends SessionDataT = SessionDataT>(
  event: NuxtRequestEvent | undefined,
  config: SessionConfig,
  update?: SessionUpdate<T>,
): Promise<Session<T>> {
  const ev = resolveEvent(event);
  const sessionName = config.name || DEFAULT_SESSION_NAME;
  const session = await getSession<T>(ev, config);

  if (typeof update === "function") {
    const next = update(session.data);
    if (next) {
      Object.assign(session.data, next);
    }
  } else if (update && typeof update === "object") {
    Object.assign(session.data, update);
  }

  if (config.cookie !== false) {
    const sealed = await sealSession(session, config);
    setCookie(ev, sessionName, sealed, {
      ...DEFAULT_SESSION_COOKIE,
      ...(config.maxAge ? { maxAge: config.maxAge } : {}),
      ...config.cookie,
    });
  }

  return session;
}

export async function clearSession(
  event: NuxtRequestEvent | undefined,
  config: Partial<SessionConfig> = {},
): Promise<void> {
  const ev = resolveEvent(event);
  const sessionName = config.name || DEFAULT_SESSION_NAME;
  if (ev.context.sessions) {
    delete (ev.context.sessions as Record<string, unknown>)[sessionName];
  }
  if (config.cookie !== false) {
    deleteCookie(ev, sessionName, {
      ...DEFAULT_SESSION_COOKIE,
      ...config.cookie,
    });
  }
}

export async function useSession<T extends SessionDataT = SessionDataT>(
  event: NuxtRequestEvent | undefined,
  config: SessionConfig,
): Promise<SessionManager<T>> {
  const ev = resolveEvent(event);
  const sessionName = config.name || DEFAULT_SESSION_NAME;
  await getSession<T>(ev, config);

  const manager: SessionManager<T> = {
    get id() {
      return (ev.context.sessions as Record<string, Session<T>> | undefined)?.[
        sessionName
      ]?.id;
    },
    get data() {
      return (
        (ev.context.sessions as Record<string, Session<T>> | undefined)?.[
          sessionName
        ]?.data ?? ({} as T)
      );
    },
    ready: Promise.resolve(null as unknown as SessionManager<T>),
    async update(update) {
      await updateSession<T>(ev, config, update);
      return manager;
    },
    async clear() {
      await clearSession(ev, config);
      return manager;
    },
  };
  (manager as { ready: Promise<SessionManager<T>> }).ready =
    Promise.resolve(manager);
  return manager;
}

// ============================================================================
// h3 Server Router (`createRouter`, `useBase`)
// ============================================================================

export type RouterMethod =
  | "get"
  | "head"
  | "patch"
  | "post"
  | "put"
  | "delete"
  | "connect"
  | "options"
  | "trace";

export interface RouteNode {
  path: string;
  method?: RouterMethod | RouterMethod[];
  handler: (event: NuxtRequestEvent) => unknown;
}

export interface Router {
  add: (
    path: string,
    handler: EventHandler<any, any>,
    method?: RouterMethod | RouterMethod[],
  ) => Router;
  use: (
    path: string,
    handler: EventHandler<any, any>,
    method?: RouterMethod | RouterMethod[],
  ) => Router;
  get: (path: string, handler: EventHandler<any, any>) => Router;
  head: (path: string, handler: EventHandler<any, any>) => Router;
  patch: (path: string, handler: EventHandler<any, any>) => Router;
  post: (path: string, handler: EventHandler<any, any>) => Router;
  put: (path: string, handler: EventHandler<any, any>) => Router;
  delete: (path: string, handler: EventHandler<any, any>) => Router;
  connect: (path: string, handler: EventHandler<any, any>) => Router;
  options: (path: string, handler: EventHandler<any, any>) => Router;
  trace: (path: string, handler: EventHandler<any, any>) => Router;
  handler: (
    event: NuxtRequestEvent | Request | NuxtRequestInit,
  ) => Promise<any>;
}

function matchServerRoutePattern(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const normPattern =
    pattern === "/" ? "/" : `/${pattern.replace(/^\/+|\/+$/g, "")}`;
  const normPath =
    pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}`;

  if (normPattern === "/**" || normPattern === "/*") {
    return { _: normPath.replace(/^\/+/, "") };
  }
  if (normPattern === normPath && !normPattern.includes(":")) {
    return {};
  }

  const patternSegs =
    normPattern === "/" ? [] : normPattern.slice(1).split("/");
  const pathSegs = normPath === "/" ? [] : normPath.slice(1).split("/");
  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegs.length; i++) {
    const seg = patternSegs[i]!;
    if (seg === "**" || seg.startsWith("**:")) {
      const paramName = seg.startsWith("**:") ? seg.slice(3) || "_" : "_";
      params[paramName] = pathSegs.slice(i).join("/");
      return params;
    }
    if (i >= pathSegs.length) {
      return null;
    }
    const actual = pathSegs[i]!;
    if (seg === "*") {
      params._ = actual;
      continue;
    }
    if (seg.startsWith(":")) {
      const paramName = seg.slice(1);
      params[paramName] = actual;
      continue;
    }
    if (seg !== actual) {
      return null;
    }
  }

  if (pathSegs.length !== patternSegs.length) {
    return null;
  }
  return params;
}

export function createRouter(): Router {
  const routes: RouteNode[] = [];

  const add = (
    path: string,
    handler: EventHandler<any, any>,
    method?: RouterMethod | RouterMethod[],
  ): Router => {
    routes.push({
      path,
      method,
      handler: defineEventHandler(handler),
    });
    return router;
  };

  const router: Router = {
    add,
    use: add,
    get: (path, handler) => add(path, handler, "get"),
    head: (path, handler) => add(path, handler, "head"),
    patch: (path, handler) => add(path, handler, "patch"),
    post: (path, handler) => add(path, handler, "post"),
    put: (path, handler) => add(path, handler, "put"),
    delete: (path, handler) => add(path, handler, "delete"),
    connect: (path, handler) => add(path, handler, "connect"),
    options: (path, handler) => add(path, handler, "options"),
    trace: (path, handler) => add(path, handler, "trace"),
    handler: defineEventHandler(async (event) => {
      const reqMethod = getMethod(event).toLowerCase() as RouterMethod;
      const pathname = event.url.pathname || "/";
      let pathMatchedWithDifferentMethod = false;

      for (const route of routes) {
        const matchedParams = matchServerRoutePattern(route.path, pathname);
        if (!matchedParams) {
          continue;
        }
        if (route.method) {
          const methods = Array.isArray(route.method)
            ? route.method
            : [route.method];
          if (!methods.includes(reqMethod)) {
            pathMatchedWithDifferentMethod = true;
            continue;
          }
        }
        event.context.params = {
          ...event.context.params,
          ...matchedParams,
        };
        event.context.matchedRoute = route;
        return route.handler(event);
      }

      if (pathMatchedWithDifferentMethod) {
        throw createError({
          statusCode: 405,
          statusMessage: `Method ${reqMethod.toUpperCase()} is not allowed for ${pathname}`,
        });
      }
      throw createError({
        statusCode: 404,
        statusMessage: `Cannot find any route matching ${pathname}`,
      });
    }),
  };

  return router;
}

export function useBase(
  base: string,
  handler: EventHandler<any, any>,
): (event: NuxtRequestEvent | Request | NuxtRequestInit) => Promise<any> {
  const cleanBase = `/${base.replace(/^\/+|\/+$/g, "")}`;
  const wrapped = defineEventHandler(handler);
  return defineEventHandler(async (event) => {
    const pathname = event.url.pathname || "/";
    if (
      cleanBase !== "/" &&
      pathname !== cleanBase &&
      !pathname.startsWith(`${cleanBase}/`)
    ) {
      throw createError({
        statusCode: 404,
        statusMessage: `Cannot find any route matching ${pathname}`,
      });
    }
    const stripped =
      cleanBase === "/" ? pathname : pathname.slice(cleanBase.length) || "/";
    const previousPath = event.path;
    const previousPathname = event.url.pathname;
    event.url.pathname = stripped;
    event.path = `${stripped}${event.url.search}`;
    try {
      return await wrapped(event);
    } finally {
      event.url.pathname = previousPathname;
      event.path = previousPath;
    }
  });
}

// ============================================================================
// Nitro Server Storage (`useStorage`, `createStorage`, `prefixStorage`, `memoryDriver`)
// ============================================================================

export type StorageValue =
  null | string | number | boolean | Record<string, any> | any[];

export interface StorageMeta {
  atime?: Date;
  mtime?: Date;
  ttl?: number;
  [key: string]: StorageValue | Date | undefined;
}

export type WatchEvent = "update" | "remove";
export type WatchCallback = (event: WatchEvent, key: string) => any;
export type Unwatch = () => Promise<void>;

export interface StorageDriver {
  name?: string;
  hasItem(key: string, opts?: Record<string, any>): boolean | Promise<boolean>;
  getItem(
    key: string,
    opts?: Record<string, any>,
  ): StorageValue | Promise<StorageValue>;
  getItemRaw?(key: string, opts?: Record<string, any>): any | Promise<any>;
  setItem?(
    key: string,
    value: string,
    opts?: Record<string, any>,
  ): void | Promise<void>;
  setItemRaw?(
    key: string,
    value: any,
    opts?: Record<string, any>,
  ): void | Promise<void>;
  removeItem?(key: string, opts?: Record<string, any>): void | Promise<void>;
  getMeta?(
    key: string,
    opts?: Record<string, any>,
  ): StorageMeta | null | Promise<StorageMeta | null>;
  getKeys(
    base: string,
    opts?: Record<string, any>,
  ): string[] | Promise<string[]>;
  clear?(base: string, opts?: Record<string, any>): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface Storage<T extends StorageValue = StorageValue> {
  hasItem(key: string, opts?: Record<string, any>): Promise<boolean>;
  getItem<U extends T = T>(
    key: string,
    opts?: Record<string, any>,
  ): Promise<U | null>;
  getItems<U extends T = T>(
    items: Array<string | { key: string; options?: Record<string, any> }>,
    commonOptions?: Record<string, any>,
  ): Promise<Array<{ key: string; value: U | null }>>;
  getItemRaw<U = any>(
    key: string,
    opts?: Record<string, any>,
  ): Promise<U | null>;
  setItem<U extends T = T>(
    key: string,
    value: U,
    opts?: Record<string, any>,
  ): Promise<void>;
  setItems<U extends T = T>(
    items: Array<{ key: string; value: U; options?: Record<string, any> }>,
    commonOptions?: Record<string, any>,
  ): Promise<void>;
  setItemRaw<U = any>(
    key: string,
    value: U,
    opts?: Record<string, any>,
  ): Promise<void>;
  removeItem(
    key: string,
    opts?: boolean | { removeMeta?: boolean },
  ): Promise<void>;
  getMeta(key: string, opts?: Record<string, any>): Promise<StorageMeta>;
  setMeta(
    key: string,
    meta: StorageMeta,
    opts?: Record<string, any>,
  ): Promise<void>;
  removeMeta(key: string, opts?: Record<string, any>): Promise<void>;
  getKeys(base?: string, opts?: Record<string, any>): Promise<string[]>;
  clear(base?: string, opts?: Record<string, any>): Promise<void>;
  mount(base: string, driver: StorageDriver): Storage<T>;
  unmount(base: string, dispose?: boolean): Promise<void>;
  getMount(key?: string): { base: string; driver: StorageDriver };
  getMounts(
    base?: string,
    opts?: { parents?: boolean },
  ): Array<{ base: string; driver: StorageDriver }>;
  watch(callback: WatchCallback): Promise<Unwatch>;
  unwatch(): Promise<void>;
  dispose(): Promise<void>;
  // Aliases
  has(key: string, opts?: Record<string, any>): Promise<boolean>;
  get<U extends T = T>(
    key: string,
    opts?: Record<string, any>,
  ): Promise<U | null>;
  set<U extends T = T>(
    key: string,
    value: U,
    opts?: Record<string, any>,
  ): Promise<void>;
  del(key: string, opts?: boolean | { removeMeta?: boolean }): Promise<void>;
  remove(key: string, opts?: boolean | { removeMeta?: boolean }): Promise<void>;
  keys(base?: string, opts?: Record<string, any>): Promise<string[]>;
}

function normalizeStorageKey(key?: string): string {
  if (!key) return "";
  return key.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "");
}

function normalizeStorageBaseKey(base?: string): string {
  const clean = normalizeStorageKey(base);
  return clean ? `${clean}:` : "";
}

function serializeStorageValue(val: unknown): string {
  if (typeof val === "string") {
    return val;
  }
  return JSON.stringify(val);
}

function deserializeStorageValue(raw: unknown): any {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function memoryDriver(): StorageDriver {
  const data = new Map<string, any>();
  return {
    name: "memory",
    hasItem(key) {
      return data.has(key);
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    getItemRaw(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    setItemRaw(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    getKeys() {
      return Array.from(data.keys());
    },
    clear() {
      data.clear();
    },
    dispose() {
      data.clear();
    },
  };
}

export interface CreateStorageOptions {
  driver?: StorageDriver;
}

export function createStorage<T extends StorageValue = StorageValue>(
  options: CreateStorageOptions = {},
): Storage<T> {
  const mounts = new Map<string, StorageDriver>([
    ["", options.driver || memoryDriver()],
  ]);
  const watchers = new Set<WatchCallback>();

  const resolveMount = (
    key: string,
  ): { base: string; relativeKey: string; driver: StorageDriver } => {
    const sortedBases = Array.from(mounts.keys()).sort(
      (a, b) => b.length - a.length,
    );
    for (const base of sortedBases) {
      if (!base || key.startsWith(base)) {
        return {
          base,
          relativeKey: key.slice(base.length),
          driver: mounts.get(base)!,
        };
      }
    }
    return {
      base: "",
      relativeKey: key,
      driver: mounts.get("")!,
    };
  };

  const notifyWatchers = (event: WatchEvent, key: string) => {
    for (const cb of watchers) {
      try {
        cb(event, key);
      } catch {
        // Ignore watcher error
      }
    }
  };

  const storage: Storage<T> = {
    async hasItem(key, opts = {}) {
      const norm = normalizeStorageKey(key);
      const { relativeKey, driver } = resolveMount(norm);
      return Boolean(await driver.hasItem(relativeKey, opts));
    },
    async getItem<U extends T = T>(key: string, opts = {}) {
      const norm = normalizeStorageKey(key);
      const { relativeKey, driver } = resolveMount(norm);
      const val = await driver.getItem(relativeKey, opts);
      return deserializeStorageValue(val) as U | null;
    },
    async getItems<U extends T = T>(
      items: Array<string | { key: string; options?: Record<string, any> }>,
      commonOptions: Record<string, any> = {},
    ) {
      return Promise.all(
        items.map(
          async (
            item: string | { key: string; options?: Record<string, any> },
          ) => {
            const key = typeof item === "string" ? item : item.key;
            const opts =
              typeof item === "string"
                ? commonOptions
                : { ...commonOptions, ...item.options };
            const value = await storage.getItem<U>(key, opts);
            return { key, value };
          },
        ),
      );
    },
    async getItemRaw<U = any>(key: string, opts = {}) {
      const norm = normalizeStorageKey(key);
      const { relativeKey, driver } = resolveMount(norm);
      if (driver.getItemRaw) {
        return (await driver.getItemRaw(relativeKey, opts)) as U | null;
      }
      const val = await driver.getItem(relativeKey, opts);
      return (val ?? null) as U | null;
    },
    async setItem(key, value, opts = {}) {
      if (value === undefined) {
        return storage.removeItem(key);
      }
      const norm = normalizeStorageKey(key);
      const { relativeKey, driver } = resolveMount(norm);
      if (!driver.setItem) return;
      await driver.setItem(relativeKey, serializeStorageValue(value), opts);
      notifyWatchers("update", norm);
    },
    async setItems(items, commonOptions = {}) {
      await Promise.all(
        items.map((item) =>
          storage.setItem(item.key, item.value, {
            ...commonOptions,
            ...item.options,
          }),
        ),
      );
    },
    async setItemRaw(key, value, opts = {}) {
      if (value === undefined) {
        return storage.removeItem(key);
      }
      const norm = normalizeStorageKey(key);
      const { relativeKey, driver } = resolveMount(norm);
      if (driver.setItemRaw) {
        await driver.setItemRaw(relativeKey, value, opts);
      } else if (driver.setItem) {
        await driver.setItem(relativeKey, serializeStorageValue(value), opts);
      }
      notifyWatchers("update", norm);
    },
    async removeItem(key, opts = {}) {
      const norm = normalizeStorageKey(key);
      const removeMeta =
        typeof opts === "boolean" ? opts : Boolean(opts?.removeMeta);
      const { relativeKey, driver } = resolveMount(norm);
      if (driver.removeItem) {
        await driver.removeItem(relativeKey, {});
      }
      if (removeMeta && driver.removeItem) {
        await driver.removeItem(`${relativeKey}$`, {});
      }
      notifyWatchers("remove", norm);
    },
    async getMeta(key, opts = {}) {
      const norm = normalizeStorageKey(key);
      const { relativeKey, driver } = resolveMount(norm);
      const meta: StorageMeta = Object.create(null);
      if (driver.getMeta) {
        const nativeMeta = await driver.getMeta(relativeKey, opts);
        if (nativeMeta) Object.assign(meta, nativeMeta);
      }
      const customMetaRaw = await driver.getItem(`${relativeKey}$`, opts);
      const customMeta = deserializeStorageValue(customMetaRaw);
      if (customMeta && typeof customMeta === "object") {
        Object.assign(meta, customMeta);
      }
      return meta;
    },
    async setMeta(key, meta, opts = {}) {
      return this.setItem(`${normalizeStorageKey(key)}$`, meta as any, opts);
    },
    async removeMeta(key, opts = {}) {
      return this.removeItem(`${normalizeStorageKey(key)}$`, opts as any);
    },
    async getKeys(base, opts = {}) {
      const normBase = normalizeStorageBaseKey(base);
      const results = new Set<string>();
      for (const [mountBase, driver] of mounts.entries()) {
        const rawKeys = await driver.getKeys(mountBase, opts);
        for (const k of rawKeys) {
          if (k.endsWith("$")) continue;
          const fullKey = mountBase + normalizeStorageKey(k);
          if (!normBase || fullKey.startsWith(normBase)) {
            results.add(fullKey);
          }
        }
      }
      return Array.from(results);
    },
    async clear(base, opts = {}) {
      const normBase = normalizeStorageBaseKey(base);
      const keys = await storage.getKeys(normBase, opts);
      await Promise.all(keys.map((key) => storage.removeItem(key, true)));
    },
    mount(base, driver) {
      const normBase = normalizeStorageBaseKey(base);
      mounts.set(normBase, driver);
      return storage;
    },
    async unmount(base, dispose = true) {
      const normBase = normalizeStorageBaseKey(base);
      if (!normBase) return;
      const driver = mounts.get(normBase);
      if (driver && dispose && driver.dispose) {
        await driver.dispose();
      }
      mounts.delete(normBase);
    },
    getMount(key = "") {
      const norm = normalizeStorageKey(key);
      const { base, driver } = resolveMount(norm);
      return { base, driver };
    },
    getMounts(base = "", opts = {}) {
      const normBase = normalizeStorageKey(base);
      const list: Array<{ base: string; driver: StorageDriver }> = [];
      for (const [mountBase, driver] of mounts.entries()) {
        if (
          !normBase ||
          mountBase.startsWith(normBase) ||
          (opts.parents && normBase.startsWith(mountBase))
        ) {
          list.push({ base: mountBase, driver });
        }
      }
      return list;
    },
    async watch(callback) {
      watchers.add(callback);
      return async () => {
        watchers.delete(callback);
      };
    },
    async unwatch() {
      watchers.clear();
    },
    async dispose() {
      watchers.clear();
      for (const driver of mounts.values()) {
        if (driver.dispose) {
          await driver.dispose();
        }
      }
    },
    has(key, opts) {
      return storage.hasItem(key, opts);
    },
    get(key, opts) {
      return storage.getItem(key, opts);
    },
    set(key, value, opts) {
      return storage.setItem(key, value, opts);
    },
    del(key, opts) {
      return storage.removeItem(key, opts);
    },
    remove(key, opts) {
      return storage.removeItem(key, opts);
    },
    keys(base, opts) {
      return storage.getKeys(base, opts);
    },
  };

  return storage;
}

export function prefixStorage<T extends StorageValue = StorageValue>(
  storage: Storage<any>,
  base: string,
): Storage<T> {
  const normBase = normalizeStorageBaseKey(base);
  if (!normBase) {
    return storage as Storage<T>;
  }
  const prefixKey = (key = "") => normBase + normalizeStorageKey(key);
  const stripBase = (key: string) =>
    key.startsWith(normBase) ? key.slice(normBase.length) : key;

  const view: Storage<T> = {
    ...storage,
    hasItem: (key, opts) => storage.hasItem(prefixKey(key), opts),
    getItem: (key, opts) => storage.getItem(prefixKey(key), opts),
    getItems: (items, commonOptions) =>
      storage.getItems(
        items.map((item) =>
          typeof item === "string"
            ? prefixKey(item)
            : { ...item, key: prefixKey(item.key) },
        ),
        commonOptions,
      ),
    getItemRaw: (key, opts) => storage.getItemRaw(prefixKey(key), opts),
    setItem: (key, val, opts) => storage.setItem(prefixKey(key), val, opts),
    setItems: (items, commonOptions) =>
      storage.setItems(
        items.map((item) => ({ ...item, key: prefixKey(item.key) })),
        commonOptions,
      ),
    setItemRaw: (key, val, opts) =>
      storage.setItemRaw(prefixKey(key), val, opts),
    removeItem: (key, opts) => storage.removeItem(prefixKey(key), opts),
    getMeta: (key, opts) => storage.getMeta(prefixKey(key), opts),
    setMeta: (key, meta, opts) => storage.setMeta(prefixKey(key), meta, opts),
    removeMeta: (key, opts) => storage.removeMeta(prefixKey(key), opts),
    async getKeys(subBase, opts) {
      const keys = await storage.getKeys(prefixKey(subBase), opts);
      return keys.map(stripBase);
    },
    clear: (subBase, opts) => storage.clear(prefixKey(subBase), opts),
    watch: (cb) =>
      storage.watch((ev, key) => {
        if (key.startsWith(normBase)) {
          cb(ev, stripBase(key));
        }
      }),
    has: (key, opts) => view.hasItem(key, opts),
    get: (key, opts) => view.getItem(key, opts),
    set: (key, val, opts) => view.setItem(key, val, opts),
    del: (key, opts) => view.removeItem(key, opts),
    remove: (key, opts) => view.removeItem(key, opts),
    keys: (subBase, opts) => view.getKeys(subBase, opts),
  };

  return view;
}

const defaultNitroStorage = createStorage();

export function useStorage<T extends StorageValue = StorageValue>(
  base = "",
): Storage<T> {
  return base
    ? prefixStorage<T>(defaultNitroStorage, base)
    : (defaultNitroStorage as Storage<T>);
}

export async function clearStorage(base = ""): Promise<void> {
  await defaultNitroStorage.clear(base);
}

// ============================================================================
// Nitro Server Caching (`defineCachedFunction`, `defineCachedEventHandler`)
// ============================================================================

export interface CacheEntry<T = any> {
  value?: T;
  ctime?: number;
  mtime?: number;
  integrity?: any;
  expires?: number;
}

export interface CacheOptions<T = any, ArgsT extends unknown[] = any[]> {
  name?: string;
  getKey?: (...args: ArgsT) => string | Promise<string>;
  transform?: (entry: CacheEntry<T>, ...args: ArgsT) => any;
  validate?: (entry: CacheEntry<T>, ...args: ArgsT) => boolean;
  shouldInvalidateCache?: (...args: ArgsT) => boolean | Promise<boolean>;
  shouldBypassCache?: (...args: ArgsT) => boolean | Promise<boolean>;
  group?: string;
  integrity?: any;
  maxAge?: number;
  swr?: boolean;
  staleMaxAge?: number;
  base?: string;
}

export interface CachedEventHandlerOptions<
  O = EventHandlerResponse,
> extends Omit<
  CacheOptions<O, [NuxtRequestEvent]>,
  "getKey" | "shouldBypassCache" | "shouldInvalidateCache"
> {
  getKey?: (event: NuxtRequestEvent) => string | Promise<string>;
  shouldBypassCache?: (event: NuxtRequestEvent) => boolean | Promise<boolean>;
  shouldInvalidateCache?: (
    event: NuxtRequestEvent,
  ) => boolean | Promise<boolean>;
  headersOnly?: boolean;
  varies?: string[];
}

function defaultHashKey(input: unknown): string {
  const raw = typeof input === "string" ? input : (JSON.stringify(input) ?? "");
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function defineCachedFunction<T = any, ArgsT extends unknown[] = any[]>(
  fn: (...args: ArgsT) => T | Promise<T>,
  opts: CacheOptions<T, ArgsT> = {},
): (...args: ArgsT) => Promise<T> {
  const group = opts.group || "nitro/functions";
  const name = opts.name || fn.name || "_";
  const storageBase = opts.base || "cache";
  const swr = opts.swr ?? true;
  const maxAgeMs = (opts.maxAge ?? 1) * 1000;
  const staleMaxAgeMs =
    opts.staleMaxAge !== undefined ? opts.staleMaxAge * 1000 : 0;
  const inFlight = new Map<string, Promise<T>>();

  return async (...args: ArgsT): Promise<T> => {
    const shouldBypass = await opts.shouldBypassCache?.(...args);
    if (shouldBypass) {
      return fn(...args);
    }

    const itemKey = opts.getKey
      ? await opts.getKey(...args)
      : defaultHashKey(args);
    const cacheKey = `${group}:${name}:${itemKey}.json`;
    const storage = useStorage<CacheEntry<T>>(storageBase);

    const shouldInvalidate = await opts.shouldInvalidateCache?.(...args);
    let entry = shouldInvalidate ? null : await storage.getItem(cacheKey);
    const now = Date.now();

    const isExpired =
      !entry ||
      (opts.integrity !== undefined && entry.integrity !== opts.integrity) ||
      (entry.expires !== undefined && now > entry.expires) ||
      (opts.validate && !opts.validate(entry, ...args));

    const canServeStale =
      Boolean(entry) &&
      isExpired &&
      swr &&
      (opts.staleMaxAge === -1 ||
        (staleMaxAgeMs > 0 &&
          entry!.expires !== undefined &&
          now <= entry!.expires + staleMaxAgeMs));

    const refreshEntry = async (): Promise<T> => {
      let pending = inFlight.get(cacheKey);
      if (!pending) {
        pending = (async () => {
          try {
            const value = await fn(...args);
            const updated: CacheEntry<T> = {
              value,
              ctime: entry?.ctime ?? Date.now(),
              mtime: Date.now(),
              integrity: opts.integrity,
              expires: opts.maxAge === -1 ? undefined : Date.now() + maxAgeMs,
            };
            await storage.setItem(cacheKey, updated);
            entry = updated;
            return value;
          } finally {
            inFlight.delete(cacheKey);
          }
        })();
        inFlight.set(cacheKey, pending);
      }
      return pending;
    };

    if (!entry || (isExpired && !canServeStale)) {
      await refreshEntry();
    } else if (isExpired && canServeStale) {
      void refreshEntry().catch(() => {});
    }

    if (opts.transform && entry) {
      return opts.transform(entry, ...args);
    }
    return entry!.value as T;
  };
}

export const cachedFunction = defineCachedFunction;

export function defineCachedEventHandler<
  RequestT = EventHandlerRequest,
  ResponseT = EventHandlerResponse,
>(
  handler: EventHandler<RequestT, ResponseT>,
  opts: CachedEventHandlerOptions<Awaited<ResponseT>> = {},
): (
  event: NuxtRequestEvent | Request | NuxtRequestInit,
) => Promise<Awaited<ResponseT>> {
  const group = opts.group || "nitro/handlers";
  const name = opts.name || handler.name || "_";

  const cachedFn = defineCachedFunction<
    {
      body: Awaited<ResponseT>;
      status: number;
      statusText: string;
      headers: Record<string, string | string[]>;
    },
    [NuxtRequestEvent]
  >(
    async (event) => {
      const body = await handler(event);
      return {
        body,
        status: getResponseStatus(event),
        statusText: getResponseStatusText(event),
        headers: getResponseHeaders(event),
      };
    },
    {
      ...opts,
      group,
      name,
      getKey: async (event) => {
        if (opts.getKey) {
          return opts.getKey(event);
        }
        const varyParts: string[] = [event.path || event.url.pathname];
        if (opts.varies) {
          for (const headerName of opts.varies) {
            const val = event.headers.get(headerName);
            if (val) varyParts.push(`${headerName.toLowerCase()}=${val}`);
          }
        }
        return defaultHashKey(varyParts.join("|"));
      },
      transform: undefined,
      validate: undefined,
    },
  );

  return defineEventHandler(async (event) => {
    if (opts.headersOnly) {
      if (handleCacheHeaders(event, { maxAge: opts.maxAge })) {
        return null as unknown as Awaited<ResponseT>;
      }
      return handler(event);
    }

    const result = await cachedFn(event);
    if (result.status) {
      setResponseStatus(event, result.status, result.statusText);
    }
    for (const [k, v] of Object.entries(result.headers ?? {})) {
      setResponseHeader(event, k, v);
    }
    if (
      opts.maxAge !== undefined &&
      opts.maxAge >= 0 &&
      !event.responseHeaders.has("cache-control")
    ) {
      const controls = [`max-age=${opts.maxAge}`, `s-maxage=${opts.maxAge}`];
      if (opts.swr !== false && opts.staleMaxAge) {
        controls.push(`stale-while-revalidate=${opts.staleMaxAge}`);
      }
      setResponseHeader(event, "cache-control", controls.join(", "));
    }
    return result.body;
  });
}

export const cachedEventHandler = defineCachedEventHandler;
