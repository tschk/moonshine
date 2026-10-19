/**
 * Host-free `@sveltejs/kit` server and universal runtime on the Moonshine graph.
 * Provides `error`, `isHttpError`, `HttpError`, `redirect`, `isRedirect`,
 * `Redirect`, `fail`, `isActionFailure`, `ActionFailure`, `json`, `text`,
 * `resolvePath`, `normalizeUrl`, `sequence`, `createKitCookies`, and
 * `createKitRequestEvent`.
 */
import { version as VERSION, type AppError } from "./navigation";

export { VERSION };
export {
  resolveRoute as resolvePath,
  type ActionResult,
  type AfterNavigate,
  type AppError,
  type BeforeNavigate,
  type GotoOptions,
  type KitLoadEvent as LoadEvent,
  type Navigation,
  type NavigationTarget,
  type NavigationType,
  type OnNavigate,
  type Page,
  type SubmitFunction,
} from "./navigation";

const httpErrorSymbol = Symbol.for("moonshine.sveltekit.httpError");
const redirectSymbol = Symbol.for("moonshine.sveltekit.redirect");
const actionFailureSymbol = Symbol.for("moonshine.sveltekit.actionFailure");

export class HttpError {
  readonly [httpErrorSymbol] = true;
  readonly status: number;
  readonly body: AppError;

  constructor(status: number, body?: AppError | string | null) {
    this.status = status;
    if (typeof body === "string") {
      this.body = { message: body };
    } else if (body && typeof body === "object") {
      this.body = body;
    } else {
      this.body = { message: `Error: ${status}` };
    }
  }

  toString(): string {
    return JSON.stringify(this.body);
  }
}

export class Redirect {
  readonly [redirectSymbol] = true;
  readonly status: number;
  readonly location: string;

  constructor(status: number, location: string) {
    this.status = status;
    this.location = location;
  }
}

export class ActionFailure<T = undefined> {
  readonly [actionFailureSymbol] = true;
  readonly status: number;
  readonly data: T;

  constructor(status: number, data?: T) {
    this.status = status;
    this.data = data as T;
  }
}

export function error(status: number, body?: AppError | string): never {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new RangeError(
      `HTTP error status code must be between 400 and 599 (received ${status})`,
    );
  }
  throw new HttpError(status, body);
}

export function isHttpError<T extends number = number>(
  e: unknown,
  status?: T,
): e is HttpError & { status: T } {
  if (
    !(e instanceof HttpError) &&
    (typeof e !== "object" || e === null || !(httpErrorSymbol in e))
  ) {
    return false;
  }
  const err = e as HttpError;
  return status === undefined ? true : err.status === status;
}

export function redirect(
  status: 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | (number & {}),
  location: string | URL,
): never {
  if (!Number.isInteger(status) || status < 300 || status > 308) {
    throw new RangeError(
      `Redirect status code must be between 300 and 308 (received ${status})`,
    );
  }
  throw new Redirect(
    status,
    typeof location === "string" ? location : location.href,
  );
}

export function isRedirect(e: unknown): e is Redirect {
  return (
    e instanceof Redirect ||
    (typeof e === "object" && e !== null && redirectSymbol in e)
  );
}

export function fail<T extends Record<string, unknown> | undefined = undefined>(
  status: number,
  data?: T,
): ActionFailure<T> {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new RangeError(
      `Action failure status code must be between 400 and 599 (received ${status})`,
    );
  }
  return new ActionFailure(status, data);
}

export function isActionFailure(e: unknown): e is ActionFailure<any> {
  return (
    e instanceof ActionFailure ||
    (typeof e === "object" && e !== null && actionFailureSymbol in e)
  );
}

export function json(data: any, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function text(body: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain;charset=utf-8");
  }
  return new Response(body, {
    ...init,
    headers,
  });
}

export function normalizeUrl(url: URL | string): {
  url: URL;
  wasNormalized: boolean;
  denormalize(target?: URL | string): URL;
} {
  const original = typeof url === "string" ? new URL(url) : new URL(url.href);
  const hadTrailingSlash =
    original.pathname.length > 1 && original.pathname.endsWith("/");
  const normalized = new URL(original.href);
  let wasNormalized = false;

  if (hadTrailingSlash) {
    normalized.pathname = normalized.pathname.replace(/\/+$/, "") || "/";
    wasNormalized = true;
  }
  if (normalized.pathname.includes("//")) {
    normalized.pathname = normalized.pathname.replace(/\/+/g, "/");
    wasNormalized = true;
  }

  return {
    url: normalized,
    wasNormalized,
    denormalize(target?: URL | string): URL {
      const next =
        target === undefined
          ? new URL(normalized.href)
          : typeof target === "string"
            ? new URL(target, normalized)
            : new URL(target.href);
      if (hadTrailingSlash && !next.pathname.endsWith("/")) {
        next.pathname += "/";
      }
      return next;
    },
  };
}

// ============================================================================
// Cookies & RequestEvent (`createKitCookies`, `createKitRequestEvent`, `sequence`)
// ============================================================================

export interface CookieSerializeOptions {
  domain?: string;
  encode?: (value: string) => string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path: string;
  priority?: "low" | "medium" | "high";
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
}

export interface Cookies {
  get(
    name: string,
    opts?: { decode?: (value: string) => string },
  ): string | undefined;
  getAll(opts?: {
    decode?: (value: string) => string;
  }): Array<{ name: string; value: string }>;
  set(name: string, value: string, opts: CookieSerializeOptions): void;
  delete(name: string, opts: CookieSerializeOptions): void;
  serialize(name: string, value: string, opts: CookieSerializeOptions): string;
}

export function createKitCookies(
  requestHeaders?: Headers,
  responseHeaders?: Headers,
): Cookies {
  const jar = new Map<string, string>();
  const cookieHeader = requestHeaders?.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    jar.set(k, v);
  }

  function serialize(
    name: string,
    value: string,
    opts: CookieSerializeOptions,
  ): string {
    const encode = opts.encode ?? encodeURIComponent;
    const parts = [`${name}=${encode(value)}`];
    if (opts.path) parts.push(`Path=${opts.path}`);
    if (opts.domain) parts.push(`Domain=${opts.domain}`);
    if (opts.maxAge !== undefined)
      parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
    if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
    if (opts.httpOnly !== false) parts.push("HttpOnly");
    if (opts.secure) parts.push("Secure");
    if (opts.sameSite) {
      const s =
        opts.sameSite === true
          ? "Strict"
          : opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1);
      parts.push(`SameSite=${s}`);
    }
    if (opts.priority) {
      const p = opts.priority.charAt(0).toUpperCase() + opts.priority.slice(1);
      parts.push(`Priority=${p}`);
    }
    return parts.join("; ");
  }

  return {
    get(name: string, opts?: { decode?: (value: string) => string }) {
      const raw = jar.get(name);
      if (raw === undefined) return undefined;
      const decode = opts?.decode ?? decodeURIComponent;
      return decode(raw);
    },
    getAll(opts?: { decode?: (value: string) => string }) {
      const decode = opts?.decode ?? decodeURIComponent;
      return Array.from(jar.entries(), ([name, val]) => ({
        name,
        value: decode(val),
      }));
    },
    set(name: string, value: string, opts: CookieSerializeOptions) {
      const encode = opts.encode ?? encodeURIComponent;
      jar.set(name, encode(value));
      responseHeaders?.append("set-cookie", serialize(name, value, opts));
    },
    delete(name: string, opts: CookieSerializeOptions) {
      jar.delete(name);
      responseHeaders?.append(
        "set-cookie",
        serialize(name, "", {
          ...opts,
          maxAge: 0,
          expires: new Date(0),
        }),
      );
    },
    serialize,
  };
}

export interface RequestEvent<
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
> {
  cookies: Cookies;
  fetch: typeof globalThis.fetch;
  getClientAddress(): string;
  locals: Record<string, any>;
  params: Params;
  platform: Readonly<Record<string, any>> | undefined;
  request: Request;
  route: { id: RouteId };
  setHeaders(headers: Record<string, string>): void;
  url: URL;
  isDataRequest: boolean;
  isSubRequest: boolean;
}

export interface KitRequestEventInit<
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
> {
  request?: Request;
  url?: string | URL;
  params?: Params;
  routeId?: RouteId;
  locals?: Record<string, any>;
  platform?: Record<string, any>;
  clientAddress?: string;
  responseHeaders?: Headers;
}

export function createKitRequestEvent<
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
>(
  init: KitRequestEventInit<Params, RouteId> = {},
): RequestEvent<Params, RouteId> {
  const url =
    init.url instanceof URL
      ? new URL(init.url.href)
      : typeof init.url === "string"
        ? new URL(init.url, "http://localhost")
        : init.request
          ? new URL(init.request.url)
          : new URL("http://localhost/");
  const request = init.request ?? new Request(url.href);
  const responseHeaders = init.responseHeaders ?? new Headers();
  const cookies = createKitCookies(request.headers, responseHeaders);

  return {
    cookies,
    fetch: globalThis.fetch.bind(globalThis),
    getClientAddress() {
      return (
        init.clientAddress ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "127.0.0.1"
      );
    },
    locals: init.locals ?? {},
    params: (init.params ?? {}) as Params,
    platform: init.platform,
    request,
    route: { id: (init.routeId ?? (url.pathname as RouteId)) as RouteId },
    setHeaders(headers: Record<string, string>) {
      for (const [k, v] of Object.entries(headers)) {
        responseHeaders.set(k, v);
      }
    },
    url,
    isDataRequest: url.pathname.endsWith("/__data.json"),
    isSubRequest: false,
  };
}

export interface ResolveOptions {
  transformPageChunk?: (input: {
    html: string;
    done: boolean;
  }) => Promise<string | undefined> | string | undefined;
  filterSerializedResponseHeaders?: (name: string, value: string) => boolean;
  preload?: (input: {
    type: "font" | "css" | "js" | "asset";
    path: string;
  }) => boolean;
}

export type Handle = (input: {
  event: RequestEvent;
  resolve: (
    event: RequestEvent,
    options?: ResolveOptions,
  ) => Promise<Response> | Response;
}) => Promise<Response> | Response;

export function sequence(...handlers: Handle[]): Handle {
  const length = handlers.length;
  if (length === 0) {
    return ({ event, resolve }) => resolve(event);
  }

  return ({ event, resolve }) => {
    function applyHandle(
      i: number,
      currentEvent: RequestEvent,
      parentOptions?: ResolveOptions,
    ): Promise<Response> | Response {
      const handle = handlers[i]!;
      return handle({
        event: currentEvent,
        resolve: (nextEvent, options) => {
          const mergedOptions: ResolveOptions = {
            transformPageChunk: options?.transformPageChunk
              ? async ({ html, done }) => {
                  const parentHtml = parentOptions?.transformPageChunk
                    ? ((await parentOptions.transformPageChunk({
                        html,
                        done,
                      })) ?? html)
                    : html;
                  return (
                    (await options.transformPageChunk!({
                      html: parentHtml,
                      done,
                    })) ?? parentHtml
                  );
                }
              : parentOptions?.transformPageChunk,
            filterSerializedResponseHeaders:
              options?.filterSerializedResponseHeaders ??
              parentOptions?.filterSerializedResponseHeaders,
            preload: options?.preload ?? parentOptions?.preload,
          };

          if (i < length - 1) {
            return applyHandle(i + 1, nextEvent, mergedOptions);
          }
          return resolve(nextEvent, mergedOptions);
        },
      });
    }

    return applyHandle(0, event, undefined);
  };
}
