/**
 * Host-free `@sveltejs/kit` server and universal runtime on the Moonshine graph.
 * Provides `error`, `isHttpError`, `HttpError`, `redirect`, `isRedirect`,
 * `Redirect`, `fail`, `isActionFailure`, `ActionFailure`, `json`, `text`,
 * `resolvePath`, `normalizeUrl`, `sequence`, `createKitCookies`, and
 * `createKitRequestEvent`.
 */
import {
  page,
  setKitPage,
  version as VERSION,
  type ActionResult,
  type AppError,
  type NavigationTarget,
} from "./navigation";

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
  method?: string;
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
  const request =
    init.request ??
    new Request(url.href, init.method ? { method: init.method } : undefined);
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

// ============================================================================
// `$env/dynamic/public`, `$env/dynamic/private`, `$env/static/public`, `$env/static/private`
// ============================================================================

export interface KitEnvConfig {
  publicPrefix?: string;
  privatePrefix?: string;
  env?: Record<string, string | undefined>;
  values?: Record<string, string | undefined>;
}

let envPublicPrefix = "PUBLIC_";
let envPrivatePrefix = "";
const customEnvStore = new Map<string, string>();

function readProcessEnv(): Record<string, string | undefined> {
  if (
    typeof process !== "undefined" &&
    process !== null &&
    typeof process.env === "object" &&
    process.env !== null
  ) {
    return process.env as Record<string, string | undefined>;
  }
  return {};
}

function collectEnvEntries(
  mode: "all" | "public" | "private",
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const procEnv = readProcessEnv();
  const assignIfMatch = (key: string, val: string | undefined) => {
    if (val === undefined) return;
    const isPub = envPublicPrefix ? key.startsWith(envPublicPrefix) : false;
    const isPriv = envPrivatePrefix
      ? !isPub && key.startsWith(envPrivatePrefix)
      : true;
    if (
      mode === "all" ||
      (mode === "public" && isPub) ||
      (mode === "private" && isPriv)
    ) {
      result[key] = String(val);
    }
  };
  for (const [k, v] of Object.entries(procEnv)) {
    assignIfMatch(k, v);
  }
  for (const [k, v] of customEnvStore.entries()) {
    assignIfMatch(k, v);
  }
  return result;
}

function createEnvProxy(
  mode: "all" | "public" | "private",
): Record<string, string | undefined> {
  return new Proxy(Object.create(null) as Record<string, string | undefined>, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      const entries = collectEnvEntries(mode);
      return entries[prop];
    },
    has(_target, prop) {
      if (typeof prop !== "string") return false;
      const entries = collectEnvEntries(mode);
      return prop in entries;
    },
    ownKeys() {
      return Object.keys(collectEnvEntries(mode));
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== "string") return undefined;
      const entries = collectEnvEntries(mode);
      if (!(prop in entries)) return undefined;
      return {
        value: entries[prop],
        writable: false,
        enumerable: true,
        configurable: true,
      };
    },
    set() {
      throw new TypeError("Cannot mutate read-only SvelteKit $env object");
    },
    deleteProperty() {
      throw new TypeError("Cannot mutate read-only SvelteKit $env object");
    },
  });
}

export const publicEnv: Record<string, string | undefined> =
  createEnvProxy("public");
export const privateEnv: Record<string, string | undefined> =
  createEnvProxy("private");
export const env: Record<string, string | undefined> = publicEnv;

export function configureKitEnv(
  config: KitEnvConfig | Record<string, string | undefined>,
): void {
  if (
    "env" in config ||
    "values" in config ||
    "publicPrefix" in config ||
    "privatePrefix" in config
  ) {
    const typed = config as KitEnvConfig;
    if (typeof typed.publicPrefix === "string") {
      envPublicPrefix = typed.publicPrefix;
    }
    if (typeof typed.privatePrefix === "string") {
      envPrivatePrefix = typed.privatePrefix;
    }
    const sourceMap = typed.env ?? typed.values;
    if (sourceMap && typeof sourceMap === "object") {
      for (const [k, v] of Object.entries(sourceMap)) {
        if (v === undefined) {
          customEnvStore.delete(k);
        } else {
          customEnvStore.set(k, String(v));
        }
      }
    }
  } else {
    for (const [k, v] of Object.entries(
      config as Record<string, string | undefined>,
    )) {
      if (v === undefined) {
        customEnvStore.delete(k);
      } else {
        customEnvStore.set(k, String(v));
      }
    }
  }
}

export function resetKitEnv(): void {
  envPublicPrefix = "PUBLIC_";
  envPrivatePrefix = "";
  customEnvStore.clear();
}

// ============================================================================
// `$service-worker`
// ============================================================================

export interface KitServiceWorkerConfig {
  build?: string[];
  files?: string[];
  prerendered?: string[];
  version?: string;
  base?: string;
}

export let build: string[] = [];
export let files: string[] = [];
export let prerendered: string[] = [];
export let version: string = VERSION;
export let base = "";

export function configureKitServiceWorker(
  config: KitServiceWorkerConfig,
): void {
  if (Array.isArray(config.build)) {
    build = [...config.build];
  }
  if (Array.isArray(config.files)) {
    files = [...config.files];
  }
  if (Array.isArray(config.prerendered)) {
    prerendered = [...config.prerendered];
  }
  if (typeof config.version === "string") {
    version = config.version;
  }
  if (typeof config.base === "string") {
    base = config.base === "/" ? "" : config.base.replace(/\/+$/, "");
  }
}

export function resetKitServiceWorker(): void {
  build = [];
  files = [];
  prerendered = [];
  version = VERSION;
  base = "";
}

// ============================================================================
// `$app/server` (`getRequestEvent`, `withKitRequestEvent`, `read`, `query`, `prerender`, `command`, `form`)
// ============================================================================

const requestEventStack: RequestEvent<any, any>[] = [];

export function withKitRequestEvent<
  T,
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
>(
  eventOrInit:
    RequestEvent<Params, RouteId> | KitRequestEventInit<Params, RouteId>,
  fn: (event: RequestEvent<Params, RouteId>) => T,
): T {
  const event =
    "cookies" in eventOrInit &&
    "request" in eventOrInit &&
    "url" in eventOrInit &&
    typeof eventOrInit.getClientAddress === "function"
      ? (eventOrInit as RequestEvent<Params, RouteId>)
      : createKitRequestEvent<Params, RouteId>(
          eventOrInit as KitRequestEventInit<Params, RouteId>,
        );
  requestEventStack.push(event);
  let isAsync = false;
  try {
    const result = fn(event);
    if (
      result !== null &&
      typeof result === "object" &&
      typeof (result as any).then === "function"
    ) {
      isAsync = true;
      return (result as unknown as Promise<any>).finally(() => {
        const idx = requestEventStack.lastIndexOf(event);
        if (idx !== -1) {
          requestEventStack.splice(idx, 1);
        }
      }) as unknown as T;
    }
    return result;
  } finally {
    if (!isAsync) {
      const idx = requestEventStack.lastIndexOf(event);
      if (idx !== -1) {
        requestEventStack.splice(idx, 1);
      }
    }
  }
}

export function getRequestEvent<
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
>(): RequestEvent<Params, RouteId> {
  const current = requestEventStack[requestEventStack.length - 1];
  if (!current) {
    throw new Error(
      "getRequestEvent() cannot be called outside of an active RequestEvent context (`withKitRequestEvent`, `load`, `actions`, or remote functions)",
    );
  }
  return current as RequestEvent<Params, RouteId>;
}

export interface KitServerAssetEntry {
  body: Uint8Array | string;
  headers?: HeadersInit;
  type?: string;
  status?: number;
}

const serverAssetStore = new Map<string, KitServerAssetEntry>();

function inferMimeType(assetPath: string): string {
  const clean = assetPath.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".json")) return "application/json; charset=utf-8";
  if (clean.endsWith(".html") || clean.endsWith(".htm"))
    return "text/html; charset=utf-8";
  if (clean.endsWith(".css")) return "text/css; charset=utf-8";
  if (clean.endsWith(".js") || clean.endsWith(".mjs"))
    return "text/javascript; charset=utf-8";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".wasm")) return "application/wasm";
  if (clean.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (clean.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (clean.endsWith(".txt") || clean.endsWith(".md"))
    return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export function registerKitServerAsset(
  assetPath: string,
  body: Uint8Array | string,
  init?: { headers?: HeadersInit; type?: string; status?: number },
): void {
  serverAssetStore.set(assetPath, {
    body: typeof body === "string" ? body : new Uint8Array(body),
    headers: init?.headers,
    type: init?.type,
    status: init?.status,
  });
}

export function clearKitServerAssets(): void {
  serverAssetStore.clear();
}

export function read(asset: string): Response {
  const registered =
    serverAssetStore.get(asset) ??
    serverAssetStore.get(asset.startsWith("/") ? asset.slice(1) : `/${asset}`);
  if (registered) {
    const headers = new Headers(registered.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", registered.type ?? inferMimeType(asset));
    }
    const bodyBytes =
      typeof registered.body === "string"
        ? new TextEncoder().encode(registered.body)
        : new Uint8Array(registered.body);
    if (!headers.has("content-length")) {
      headers.set("content-length", String(bodyBytes.byteLength));
    }
    return new Response(bodyBytes as unknown as BodyInit, {
      status: registered.status ?? 200,
      headers,
    });
  }
  throw new Error(
    `SvelteKit server asset "${asset}" was not found. Register virtual assets via registerKitServerAsset("${asset}", content) before calling read("${asset}").`,
  );
}

export type RemoteSchema<Input = any, Output = Input> =
  | "unchecked"
  | ((input: unknown) => Output | Promise<Output>)
  | { parse(input: unknown): Output | Promise<Output> }
  | {
      safeParse(
        input: unknown,
      ): { success: true; data: Output } | { success: false; error: any };
    }
  | {
      "~standard": {
        validate(
          input: unknown,
        ):
          | { value: Output; issues?: undefined }
          | { issues: ReadonlyArray<{ message: string }> }
          | Promise<
              | { value: Output; issues?: undefined }
              | { issues: ReadonlyArray<{ message: string }> }
            >;
      };
    };

async function validateRemoteInput<Input, Output>(
  schema: RemoteSchema<Input, Output> | undefined,
  raw: Input,
): Promise<Output> {
  if (!schema || schema === "unchecked") {
    return raw as unknown as Output;
  }
  if (typeof schema === "function") {
    return await schema(raw);
  }
  if ("~standard" in schema && schema["~standard"]) {
    const res = await schema["~standard"].validate(raw);
    if (res.issues && res.issues.length > 0) {
      error(
        400,
        res.issues.map((i) => i.message).join("; ") || "Invalid input",
      );
    }
    return (res as { value: Output }).value;
  }
  if ("safeParse" in schema && typeof schema.safeParse === "function") {
    const res = schema.safeParse(raw);
    if (!res.success) {
      error(
        400,
        res.error?.message ? String(res.error.message) : "Validation failed",
      );
    }
    return res.data;
  }
  if ("parse" in schema && typeof schema.parse === "function") {
    try {
      return await schema.parse(raw);
    } catch (err: any) {
      error(400, err?.message ? String(err.message) : "Validation failed");
    }
  }
  return raw as unknown as Output;
}

export interface RemoteQuery<T> extends Promise<T> {
  readonly current: T | undefined;
  readonly loading: boolean;
  readonly error: any;
  readonly ready: boolean;
  refresh(): Promise<T>;
  set(value: T): void;
  withOverride(updater: (current: T) => T): () => void;
}

export interface RemoteQueryFunction<Input = void, Output = any> {
  (arg: Input): RemoteQuery<Output>;
  refresh(arg?: Input): Promise<Output>;
  set(arg: Input, value: Output): void;
  peek(arg?: Input): Output | undefined;
}

export interface RemoteBatchQueryFunction<Input = any, Output = any> {
  (arg: Input): RemoteQuery<Output>;
}

const remoteQueryCache = new Map<string, any>();

export function clearKitRemoteCache(): void {
  remoteQueryCache.clear();
}

function createRemoteQueryHandle<T>(
  runner: () => Promise<T>,
  initialCached?: { hasValue: boolean; value?: T },
  onSet?: (value: T) => void,
): RemoteQuery<T> {
  let currentVal: T | undefined = initialCached?.value;
  let isReady = Boolean(initialCached?.hasValue);
  let isLoading = !isReady;
  let currentErr: any = undefined;
  let overrideStack: T[] = [];

  const execute = (): Promise<T> => {
    isLoading = true;
    currentErr = undefined;
    return Promise.resolve()
      .then(runner)
      .then(
        (val) => {
          currentVal = val;
          isReady = true;
          isLoading = false;
          onSet?.(val);
          return val;
        },
        (err) => {
          currentErr = err;
          isLoading = false;
          throw err;
        },
      );
  };

  const basePromise = initialCached?.hasValue
    ? Promise.resolve(initialCached.value as T)
    : execute();

  const handle = Object.defineProperties(
    basePromise,
    Object.getOwnPropertyDescriptors({
      get current(): T | undefined {
        return overrideStack.length > 0
          ? overrideStack[overrideStack.length - 1]
          : currentVal;
      },
      get loading(): boolean {
        return isLoading;
      },
      get error(): any {
        return currentErr;
      },
      get ready(): boolean {
        return isReady;
      },
      async refresh(): Promise<T> {
        return execute();
      },
      set(value: T): void {
        currentVal = value;
        isReady = true;
        isLoading = false;
        currentErr = undefined;
        onSet?.(value);
      },
      withOverride(updater: (current: T) => T): () => void {
        const next = updater(
          (overrideStack.length > 0
            ? overrideStack[overrideStack.length - 1]
            : currentVal) as T,
        );
        overrideStack.push(next);
        return () => {
          const idx = overrideStack.lastIndexOf(next);
          if (idx !== -1) {
            overrideStack.splice(idx, 1);
          }
        };
      },
    }),
  ) as RemoteQuery<T>;

  return handle;
}

let remoteQueryIdCounter = 0;

function createQueryImpl<Input = void, Output = any>(
  schemaOrFn:
    RemoteSchema<Input, any> | ((arg: Input) => Output | Promise<Output>),
  maybeFn?: (arg: any) => Output | Promise<Output>,
): RemoteQueryFunction<Input, Output> {
  const hasSchema = typeof maybeFn === "function";
  const schema = hasSchema
    ? (schemaOrFn as RemoteSchema<Input, any>)
    : undefined;
  const fn = (hasSchema ? maybeFn! : schemaOrFn) as (
    arg: any,
  ) => Output | Promise<Output>;
  const queryId = `query_${++remoteQueryIdCounter}`;
  const handles = new Map<string, RemoteQuery<Output>>();

  const keyFor = (arg: Input): string => {
    try {
      return `${queryId}:${JSON.stringify(arg ?? null)}`;
    } catch {
      return `${queryId}:${String(arg)}`;
    }
  };

  const runFor = async (arg: Input): Promise<Output> => {
    const validated = await validateRemoteInput(schema, arg);
    const value = await fn(validated);
    remoteQueryCache.set(keyFor(arg), value);
    return value;
  };

  const queryFn = ((arg: Input): RemoteQuery<Output> => {
    const key = keyFor(arg);
    const existing = handles.get(key);
    if (existing && remoteQueryCache.has(key)) {
      return existing;
    }
    const hasCached = remoteQueryCache.has(key);
    const cachedValue = remoteQueryCache.get(key) as Output | undefined;
    const handle = createRemoteQueryHandle<Output>(
      () => runFor(arg),
      hasCached ? { hasValue: true, value: cachedValue } : undefined,
      (val) => {
        remoteQueryCache.set(key, val);
      },
    );
    handles.set(key, handle);
    return handle;
  }) as RemoteQueryFunction<Input, Output>;

  queryFn.refresh = async (arg?: Input): Promise<Output> => {
    const key = keyFor(arg as Input);
    const existing = handles.get(key);
    if (existing) {
      return existing.refresh();
    }
    return runFor(arg as Input);
  };

  queryFn.set = (arg: Input, value: Output): void => {
    const key = keyFor(arg);
    remoteQueryCache.set(key, value);
    handles.get(key)?.set(value);
  };

  queryFn.peek = (arg?: Input): Output | undefined => {
    const key = keyFor(arg as Input);
    const existing = handles.get(key);
    if (existing && existing.ready && remoteQueryCache.has(key)) {
      return existing.current;
    }
    return remoteQueryCache.get(key) as Output | undefined;
  };

  return queryFn;
}

function createBatchQueryImpl<Input = any, Output = any>(
  schemaOrFn: any,
  maybeFn?: any,
): RemoteBatchQueryFunction<Input, Output> {
  const hasSchema = typeof maybeFn === "function";
  const schema = hasSchema
    ? (schemaOrFn as RemoteSchema<Input, any>)
    : undefined;
  const fn = (hasSchema ? maybeFn! : schemaOrFn) as (
    args: any[],
  ) =>
    | Promise<((input: any, idx: number) => Output) | Output[]>
    | ((input: any, idx: number) => Output)
    | Output[];

  let pendingQueue: Array<{
    arg: Input;
    resolve: (value: Output) => void;
    reject: (reason: any) => void;
  }> = [];
  let flushScheduled = false;

  const flush = async () => {
    flushScheduled = false;
    const batchItems = pendingQueue;
    pendingQueue = [];
    try {
      const validatedArgs: any[] = [];
      for (const item of batchItems) {
        validatedArgs.push(await validateRemoteInput(schema, item.arg));
      }
      const resolverOrArray = await fn(validatedArgs);
      for (let i = 0; i < batchItems.length; i++) {
        const item = batchItems[i]!;
        const val =
          typeof resolverOrArray === "function"
            ? (resolverOrArray as (input: any, idx: number) => Output)(
                validatedArgs[i],
                i,
              )
            : (resolverOrArray as Output[])[i]!;
        item.resolve(val);
      }
    } catch (err) {
      for (const item of batchItems) {
        item.reject(err);
      }
    }
  };

  return ((arg: Input): RemoteQuery<Output> => {
    return createRemoteQueryHandle<Output>(() => {
      return new Promise<Output>((resolve, reject) => {
        pendingQueue.push({ arg, resolve, reject });
        if (!flushScheduled) {
          flushScheduled = true;
          queueMicrotask(flush);
        }
      });
    });
  }) as RemoteBatchQueryFunction<Input, Output>;
}

export const query: {
  <Output>(
    fn: () => Output | Promise<Output>,
  ): RemoteQueryFunction<void, Output>;
  <Input, Output>(
    fn: (arg: Input) => Output | Promise<Output>,
  ): RemoteQueryFunction<Input, Output>;
  <Input, Validated, Output>(
    schema: RemoteSchema<Input, Validated>,
    fn: (arg: Validated) => Output | Promise<Output>,
  ): RemoteQueryFunction<Input, Output>;
  batch: {
    <Input, Output>(
      fn: (
        args: Input[],
      ) =>
        | Promise<((input: Input, idx: number) => Output) | Output[]>
        | ((input: Input, idx: number) => Output)
        | Output[],
    ): RemoteBatchQueryFunction<Input, Output>;
    <Input, Validated, Output>(
      schema: RemoteSchema<Input, Validated>,
      fn: (
        args: Validated[],
      ) =>
        | Promise<((input: Validated, idx: number) => Output) | Output[]>
        | ((input: Validated, idx: number) => Output)
        | Output[],
    ): RemoteBatchQueryFunction<Input, Output>;
  };
} = Object.assign(createQueryImpl, {
  batch: createBatchQueryImpl,
}) as any;

export interface RemotePrerenderOptions<Input = any> {
  inputs?: () => Iterable<Input> | Promise<Iterable<Input>>;
  dynamic?: boolean;
}

export interface RemotePrerenderFunction<Input = void, Output = any> {
  (arg: Input): RemoteQuery<Output>;
  readonly options: RemotePrerenderOptions<Input>;
}

let remotePrerenderIdCounter = 0;

export function prerender<Output>(
  fn: () => Output | Promise<Output>,
  options?: RemotePrerenderOptions<void>,
): RemotePrerenderFunction<void, Output>;
export function prerender<Input, Output>(
  fn: (arg: Input) => Output | Promise<Output>,
  options?: RemotePrerenderOptions<Input>,
): RemotePrerenderFunction<Input, Output>;
export function prerender<Input, Validated, Output>(
  schema: RemoteSchema<Input, Validated>,
  fn: (arg: Validated) => Output | Promise<Output>,
  options?: RemotePrerenderOptions<Input>,
): RemotePrerenderFunction<Input, Output>;
export function prerender<Input = any, Output = any>(
  schemaOrFn: any,
  fnOrOptions?: any,
  maybeOptions?: RemotePrerenderOptions<Input>,
): RemotePrerenderFunction<Input, Output> {
  const hasSchema = typeof fnOrOptions === "function";
  const schema = hasSchema
    ? (schemaOrFn as RemoteSchema<Input, any>)
    : undefined;
  const fn = (hasSchema ? fnOrOptions : schemaOrFn) as (
    arg: any,
  ) => Output | Promise<Output>;
  const options = (hasSchema ? maybeOptions : fnOrOptions) ?? {};
  const prerenderId = `prerender_${++remotePrerenderIdCounter}`;

  const keyFor = (arg: Input): string => {
    try {
      return `${prerenderId}:${JSON.stringify(arg ?? null)}`;
    } catch {
      return `${prerenderId}:${String(arg)}`;
    }
  };

  const runFor = async (arg: Input): Promise<Output> => {
    const key = keyFor(arg);
    if (remoteQueryCache.has(key)) {
      return remoteQueryCache.get(key) as Output;
    }
    const validated = await validateRemoteInput(schema, arg);
    const val = await fn(validated);
    remoteQueryCache.set(key, val);
    return val;
  };

  const prerenderFn = ((arg: Input): RemoteQuery<Output> => {
    const key = keyFor(arg);
    const hasCached = remoteQueryCache.has(key);
    const cachedValue = remoteQueryCache.get(key) as Output | undefined;
    return createRemoteQueryHandle<Output>(
      () => runFor(arg),
      hasCached ? { hasValue: true, value: cachedValue } : undefined,
    );
  }) as RemotePrerenderFunction<Input, Output>;

  Object.defineProperty(prerenderFn, "options", {
    value: options,
    enumerable: true,
    writable: false,
  });

  return prerenderFn;
}

export interface RemoteCommandFunction<Input = void, Output = any> {
  (arg: Input): Promise<Output> & {
    updates(
      ...queries: Array<RemoteQuery<any> | (() => Promise<any>)>
    ): Promise<Output>;
  };
  readonly pending: number;
}

export function command<Output>(
  fn: () => Output | Promise<Output>,
): RemoteCommandFunction<void, Output>;
export function command<Input, Output>(
  fn: (arg: Input) => Output | Promise<Output>,
): RemoteCommandFunction<Input, Output>;
export function command<Input, Validated, Output>(
  schema: RemoteSchema<Input, Validated>,
  fn: (arg: Validated) => Output | Promise<Output>,
): RemoteCommandFunction<Input, Output>;
export function command<Input = any, Output = any>(
  schemaOrFn: any,
  maybeFn?: any,
): RemoteCommandFunction<Input, Output> {
  const hasSchema = typeof maybeFn === "function";
  const schema = hasSchema
    ? (schemaOrFn as RemoteSchema<Input, any>)
    : undefined;
  const fn = (hasSchema ? maybeFn : schemaOrFn) as (
    arg: any,
  ) => Output | Promise<Output>;
  let pendingCount = 0;

  const invoke = (arg: Input) => {
    pendingCount++;
    const extraUpdates: Array<RemoteQuery<any> | (() => Promise<any>)> = [];
    const promise = (async () => {
      try {
        const validated = await validateRemoteInput(schema, arg);
        const result = await fn(validated);
        for (const q of extraUpdates) {
          if (q && typeof (q as RemoteQuery<any>).refresh === "function") {
            await (q as RemoteQuery<any>).refresh();
          } else if (typeof q === "function") {
            await q();
          }
        }
        return result;
      } finally {
        pendingCount = Math.max(0, pendingCount - 1);
      }
    })();

    return Object.assign(promise, {
      updates(...queries: Array<RemoteQuery<any> | (() => Promise<any>)>) {
        extraUpdates.push(...queries);
        return promise;
      },
    });
  };

  Object.defineProperty(invoke, "pending", {
    get() {
      return pendingCount;
    },
    enumerable: true,
  });

  return invoke as RemoteCommandFunction<Input, Output>;
}

export interface RemoteFormFieldDescriptor {
  readonly name: string;
  as(
    type: string,
    value?: string | number | boolean,
  ): {
    name: string;
    type: string;
    value?: string | number | boolean;
    checked?: boolean;
  };
  value(): any;
  issues(): Array<{ message: string }>;
}

export interface RemoteForm<Input = Record<string, any>, Output = any> {
  (data?: Input | FormData): Promise<Output>;
  readonly method: "POST";
  readonly action: string;
  readonly result: Output | undefined;
  readonly pending: number;
  readonly fields: Record<string, RemoteFormFieldDescriptor> & {
    allIssues(): Array<{ message: string }>;
    set(values: Partial<Input>): void;
    value(): Input;
  };
  enhance(
    callback: (opts: {
      form: HTMLFormElement;
      data: Input;
      submit: () => Promise<Output>;
    }) => void | Promise<void>,
  ): { method: "POST"; action: string; onsubmit: (ev: Event) => Promise<void> };
  for(id: string | number): RemoteForm<Input, Output>;
  validate(opts?: { includeUntouched?: boolean }): Promise<boolean>;
}

let remoteFormIdCounter = 0;

export function form<Output>(
  fn: (data: Record<string, any>) => Output | Promise<Output>,
): RemoteForm<Record<string, any>, Output>;
export function form<Input extends Record<string, any>, Output>(
  schema: RemoteSchema<Input, Input>,
  fn: (data: Input) => Output | Promise<Output>,
): RemoteForm<Input, Output>;
export function form<
  Input extends Record<string, any> = Record<string, any>,
  Output = any,
>(schemaOrFn: any, maybeFn?: any): RemoteForm<Input, Output> {
  const hasSchema = typeof maybeFn === "function";
  const schema = hasSchema
    ? (schemaOrFn as RemoteSchema<Input, any>)
    : undefined;
  const fn = (hasSchema ? maybeFn : schemaOrFn) as (
    data: any,
  ) => Output | Promise<Output>;
  const formId = `remote_form_${++remoteFormIdCounter}`;

  const createFormInstance = (
    instanceKey = formId,
    scopedId?: string | number,
  ): RemoteForm<Input, Output> => {
    let lastResult: Output | undefined = undefined;
    let pendingCount = 0;
    let fieldValues: Record<string, any> = {};
    let fieldIssues: Array<{ message: string }> = [];
    const scopedInstances = new Map<
      string | number,
      RemoteForm<Input, Output>
    >();

    const normalizeFormData = (raw?: Input | FormData): Input => {
      if (!raw) return { ...fieldValues } as Input;
      if (typeof FormData !== "undefined" && raw instanceof FormData) {
        const obj: Record<string, any> = {};
        for (const [k, v] of raw.entries()) {
          obj[k] = v;
        }
        return obj as Input;
      }
      return raw as Input;
    };

    const submitForm = async (raw?: Input | FormData): Promise<Output> => {
      pendingCount++;
      fieldIssues = [];
      try {
        const inputObj = normalizeFormData(raw);
        fieldValues = { ...inputObj };
        const validated = await validateRemoteInput(schema, inputObj);
        const out = await fn(validated);
        lastResult = out;
        return out;
      } catch (err: any) {
        const msg = err?.body?.message ?? err?.message ?? String(err);
        fieldIssues = [{ message: String(msg) }];
        throw err;
      } finally {
        pendingCount = Math.max(0, pendingCount - 1);
      }
    };

    const fieldsProxy = new Proxy(
      {
        allIssues: () => fieldIssues,
        set: (values: Partial<Input>) => {
          fieldValues = { ...fieldValues, ...values };
        },
        value: () => ({ ...fieldValues }) as Input,
      },
      {
        get(target, prop) {
          if (prop in target) {
            return (target as any)[prop];
          }
          if (typeof prop !== "string") return undefined;
          const fieldDescriptor: RemoteFormFieldDescriptor = {
            name: prop,
            as(type: string, val?: string | number | boolean) {
              if (type === "checkbox") {
                return {
                  name: prop,
                  type,
                  checked: Boolean(val ?? fieldValues[prop]),
                };
              }
              if (type === "radio") {
                return {
                  name: prop,
                  type,
                  value: val,
                  checked: fieldValues[prop] === val,
                };
              }
              return {
                name: prop,
                type,
                value: (val ?? fieldValues[prop] ?? "") as
                  string | number | boolean,
              };
            },
            value: () => fieldValues[prop],
            issues: () => fieldIssues,
          };
          return fieldDescriptor;
        },
      },
    ) as RemoteForm<Input, Output>["fields"];

    const actionPath =
      scopedId !== undefined
        ? `?/${instanceKey}&id=${encodeURIComponent(JSON.stringify(scopedId))}`
        : `?/${instanceKey}`;

    const instance = Object.defineProperties(
      submitForm,
      Object.getOwnPropertyDescriptors({
        method: "POST" as const,
        action: actionPath,
        get result(): Output | undefined {
          return lastResult;
        },
        get pending(): number {
          return pendingCount;
        },
        fields: fieldsProxy,
        enhance(
          callback: (opts: {
            form: HTMLFormElement;
            data: Input;
            submit: () => Promise<Output>;
          }) => void | Promise<void>,
        ) {
          return {
            method: "POST" as const,
            action: actionPath,
            onsubmit: async (ev: Event) => {
              if (typeof ev?.preventDefault === "function") {
                ev.preventDefault();
              }
              const formEl = (ev?.currentTarget ??
                ev?.target) as HTMLFormElement;
              const data =
                formEl && typeof FormData !== "undefined"
                  ? normalizeFormData(new FormData(formEl))
                  : ({ ...fieldValues } as Input);
              await callback({
                form: formEl,
                data,
                submit: () => submitForm(data),
              });
            },
          };
        },
        for(id: string | number): RemoteForm<Input, Output> {
          let scoped = scopedInstances.get(id);
          if (!scoped) {
            scoped = createFormInstance(instanceKey, id);
            scopedInstances.set(id, scoped);
          }
          return scoped;
        },
        async validate(): Promise<boolean> {
          try {
            await validateRemoteInput(schema, { ...fieldValues } as Input);
            fieldIssues = [];
            return true;
          } catch (err: any) {
            const msg = err?.body?.message ?? err?.message ?? String(err);
            fieldIssues = [{ message: String(msg) }];
            return false;
          }
        },
      }),
    ) as RemoteForm<Input, Output>;

    return instance;
  };

  return createFormInstance();
}

export type RemoteFormFunction<
  Input extends Record<string, any> = Record<string, any>,
  Output = any,
> = RemoteForm<Input, Output>;

// ============================================================================
// `@sveltejs/kit` Universal / Server Data Loading & Form Actions Runtime & Types
// ============================================================================

export type ParamMatcher = (param: string) => boolean;

export type RequestHandler<
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
> = (event: RequestEvent<Params, RouteId>) => Response | Promise<Response>;

export interface ServerLoadEvent<
  Params extends Record<string, string> = Record<string, string>,
  ParentData extends Record<string, any> = Record<string, any>,
  RouteId extends string | null = string | null,
> extends RequestEvent<Params, RouteId> {
  parent(): Promise<ParentData>;
  depends(...deps: string[]): void;
  untrack<T>(fn: () => T): T;
  tracing: {
    enabled: boolean;
    root: any;
    current: any;
  };
}

export type ServerLoad<
  Params extends Record<string, string> = Record<string, string>,
  ParentData extends Record<string, any> = Record<string, any>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = (
  event: ServerLoadEvent<Params, ParentData, RouteId>,
) => OutputData | Promise<OutputData>;

export type PageServerLoad<
  Params extends Record<string, string> = Record<string, string>,
  ParentData extends Record<string, any> = Record<string, any>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = ServerLoad<Params, ParentData, OutputData, RouteId>;

export type LayoutServerLoad<
  Params extends Record<string, string> = Record<string, string>,
  ParentData extends Record<string, any> = Record<string, any>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = ServerLoad<Params, ParentData, OutputData, RouteId>;

export type Load<
  Params extends Record<string, string> = Record<string, string>,
  InputData extends Record<string, any> | null = Record<string, any> | null,
  ParentData extends Record<string, any> = Record<string, any>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = (event: {
  url: URL;
  params: Params;
  data: InputData;
  route: { id: RouteId };
  fetch: typeof globalThis.fetch;
  setHeaders(headers: Record<string, string>): void;
  parent(): Promise<ParentData>;
  depends(...deps: string[]): void;
  untrack<T>(fn: () => T): T;
}) => OutputData | Promise<OutputData>;

export type PageLoad<
  Params extends Record<string, string> = Record<string, string>,
  InputData extends Record<string, any> | null = Record<string, any> | null,
  ParentData extends Record<string, any> = Record<string, any>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = Load<Params, InputData, ParentData, OutputData, RouteId>;

export type LayoutLoad<
  Params extends Record<string, string> = Record<string, string>,
  InputData extends Record<string, any> | null = Record<string, any> | null,
  ParentData extends Record<string, any> = Record<string, any>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = Load<Params, InputData, ParentData, OutputData, RouteId>;

export type LoadProperties<T> = T extends void | undefined
  ? Record<string, never>
  : T;

export type Action<
  Params extends Record<string, string> = Record<string, string>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = (
  event: RequestEvent<Params, RouteId>,
) => OutputData | ActionFailure<any> | Promise<OutputData | ActionFailure<any>>;

export type Actions<
  Params extends Record<string, string> = Record<string, string>,
  OutputData extends Record<string, any> | void = Record<string, any> | void,
  RouteId extends string | null = string | null,
> = Record<string, Action<Params, OutputData, RouteId>>;

export type HandleFetch = (input: {
  event: RequestEvent;
  request: Request;
  fetch: typeof globalThis.fetch;
}) => Promise<Response> | Response;

export type HandleServerError = (input: {
  error: unknown;
  event: RequestEvent;
  status: number;
  message: string;
}) => Promise<AppError | void> | AppError | void;

export type HandleClientError = (input: {
  error: unknown;
  event: NavigationTarget;
  status: number;
  message: string;
}) => Promise<AppError | void> | AppError | void;

export type HandleValidationError<Issue = any> = (input: {
  issues: Issue[];
  event: RequestEvent;
}) => Promise<AppError> | AppError;

export type Reroute = (input: {
  url: URL;
  fetch: typeof globalThis.fetch;
}) => Promise<string | void> | string | void;

export type Transport = Record<
  string,
  {
    encode: (value: any) => any;
    decode: (data: any) => any;
  }
>;

export interface KitServerLoadEventInit<
  Params extends Record<string, string> = Record<string, string>,
  ParentData extends Record<string, any> = Record<string, any>,
  RouteId extends string | null = string | null,
> extends KitRequestEventInit<Params, RouteId> {
  parentData?: ParentData;
  parent?: () => Promise<ParentData> | ParentData;
  dependencies?: Set<string>;
}

export function createServerLoadEvent<
  Params extends Record<string, string> = Record<string, string>,
  ParentData extends Record<string, any> = Record<string, any>,
  RouteId extends string | null = string | null,
>(
  init: KitServerLoadEventInit<Params, ParentData, RouteId> = {},
): ServerLoadEvent<Params, ParentData, RouteId> & {
  readonly dependencies: ReadonlySet<string>;
  readonly responseHeaders: Headers;
} {
  const responseHeaders = init.responseHeaders ?? new Headers();
  const baseEvent = createKitRequestEvent<Params, RouteId>({
    ...init,
    responseHeaders,
  });
  const deps = init.dependencies ?? new Set<string>();
  return {
    ...baseEvent,
    async parent(): Promise<ParentData> {
      if (init.parent) return await init.parent();
      return (init.parentData ?? {}) as ParentData;
    },
    depends(...urls: string[]): void {
      for (const u of urls) {
        deps.add(u);
      }
    },
    untrack<T>(fn: () => T): T {
      return fn();
    },
    tracing: {
      enabled: false,
      root: null,
      current: null,
    },
    get dependencies(): ReadonlySet<string> {
      return deps;
    },
    get responseHeaders(): Headers {
      return responseHeaders;
    },
  };
}

export interface KitUniversalLoadEventInit<
  Params extends Record<string, string> = Record<string, string>,
  InputData extends Record<string, any> | null = Record<string, any> | null,
  ParentData extends Record<string, any> = Record<string, any>,
  RouteId extends string | null = string | null,
> {
  url?: string | URL;
  params?: Params;
  data?: InputData;
  parentData?: ParentData;
  routeId?: RouteId;
  fetch?: typeof globalThis.fetch;
  parent?: () => Promise<ParentData> | ParentData;
  responseHeaders?: Headers;
  dependencies?: Set<string>;
}

export function createLoadEvent<
  Params extends Record<string, string> = Record<string, string>,
  InputData extends Record<string, any> | null = Record<string, any> | null,
  ParentData extends Record<string, any> = Record<string, any>,
  RouteId extends string | null = string | null,
>(
  init: KitUniversalLoadEventInit<Params, InputData, ParentData, RouteId> = {},
) {
  const url =
    init.url instanceof URL
      ? new URL(init.url.href)
      : typeof init.url === "string"
        ? new URL(init.url, "http://localhost")
        : new URL("http://localhost/");
  const responseHeaders = init.responseHeaders ?? new Headers();
  const deps = init.dependencies ?? new Set<string>();
  return {
    url,
    params: (init.params ?? {}) as Params,
    data: (init.data ?? null) as InputData,
    route: { id: (init.routeId ?? (url.pathname as RouteId)) as RouteId },
    fetch: init.fetch ?? globalThis.fetch.bind(globalThis),
    setHeaders(headers: Record<string, string>): void {
      for (const [k, v] of Object.entries(headers)) {
        responseHeaders.set(k, v);
      }
    },
    async parent(): Promise<ParentData> {
      if (init.parent) return await init.parent();
      return (init.parentData ?? {}) as ParentData;
    },
    depends(...urls: string[]): void {
      for (const u of urls) {
        deps.add(u);
      }
    },
    untrack<T>(fn: () => T): T {
      return fn();
    },
    get dependencies(): ReadonlySet<string> {
      return deps;
    },
    get responseHeaders(): Headers {
      return responseHeaders;
    },
  };
}

export async function executeKitServerLoad<
  OutputData extends Record<string, any> | void = Record<string, any>,
  Params extends Record<string, string> = Record<string, string>,
  ParentData extends Record<string, any> = Record<string, any>,
  RouteId extends string | null = string | null,
>(
  loadFn: ServerLoad<Params, ParentData, OutputData, RouteId>,
  init: KitServerLoadEventInit<Params, ParentData, RouteId> = {},
): Promise<{
  data: OutputData;
  dependencies: string[];
  headers: Headers;
  event: ServerLoadEvent<Params, ParentData, RouteId> & {
    readonly dependencies: ReadonlySet<string>;
    readonly responseHeaders: Headers;
  };
}> {
  const responseHeaders = init.responseHeaders ?? new Headers();
  const event = createServerLoadEvent<Params, ParentData, RouteId>({
    ...init,
    responseHeaders,
  });
  const data = await withKitRequestEvent(event, () => loadFn(event));
  setKitPage({
    url: event.url,
    params: event.params,
    route: event.route,
    data:
      data && typeof data === "object"
        ? { ...page.data, ...(data as Record<string, any>) }
        : page.data,
  });
  return {
    data,
    dependencies: Array.from(event.dependencies),
    headers: responseHeaders,
    event,
  };
}

export async function executeKitUniversalLoad<
  OutputData extends Record<string, any> | void = Record<string, any>,
  Params extends Record<string, string> = Record<string, string>,
  InputData extends Record<string, any> | null = Record<string, any> | null,
  ParentData extends Record<string, any> = Record<string, any>,
  RouteId extends string | null = string | null,
>(
  loadFn: Load<Params, InputData, ParentData, OutputData, RouteId>,
  init: KitUniversalLoadEventInit<Params, InputData, ParentData, RouteId> = {},
): Promise<{
  data: OutputData;
  dependencies: string[];
  headers: Headers;
  event: ReturnType<
    typeof createLoadEvent<Params, InputData, ParentData, RouteId>
  >;
}> {
  const event = createLoadEvent<Params, InputData, ParentData, RouteId>(init);
  const data = await loadFn(event);
  setKitPage({
    url: event.url,
    params: event.params,
    route: event.route,
    data:
      data && typeof data === "object"
        ? { ...page.data, ...(data as Record<string, any>) }
        : page.data,
  });
  return {
    data,
    dependencies: Array.from(event.dependencies),
    headers: event.responseHeaders,
    event,
  };
}

export interface KitActionExecutionInit<
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
> extends KitRequestEventInit<Params, RouteId> {
  formData?: FormData;
}

export async function executeKitAction<
  Success extends Record<string, unknown> | undefined = Record<string, any>,
  Failure extends Record<string, unknown> | undefined = Record<string, any>,
  Params extends Record<string, string> = Record<string, string>,
  RouteId extends string | null = string | null,
>(
  actionsOrAction: Actions<Params, any, RouteId> | Action<Params, any, RouteId>,
  nameOrInit: string | KitActionExecutionInit<Params, RouteId> = {},
  maybeInit?: KitActionExecutionInit<Params, RouteId> | string,
): Promise<ActionResult<Success, Failure>> {
  const actionName =
    typeof nameOrInit === "string"
      ? nameOrInit
      : typeof maybeInit === "string"
        ? maybeInit
        : undefined;
  const rawInit: KitActionExecutionInit<Params, RouteId> =
    typeof nameOrInit === "object" && nameOrInit !== null
      ? nameOrInit
      : typeof maybeInit === "object" && maybeInit !== null
        ? maybeInit
        : {};

  let request = rawInit.request;
  if (!request && rawInit.formData) {
    const resolvedUrl =
      rawInit.url instanceof URL
        ? rawInit.url.href
        : typeof rawInit.url === "string"
          ? new URL(rawInit.url, "http://localhost").href
          : "http://localhost/";
    request = new Request(resolvedUrl, {
      method: "POST",
      body: rawInit.formData,
    });
  }

  const event = createKitRequestEvent<Params, RouteId>({
    ...rawInit,
    request,
    method: rawInit.method ?? "POST",
  });
  let targetAction: Action<Params, any, RouteId> | undefined;

  if (typeof actionsOrAction === "function") {
    targetAction = actionsOrAction;
  } else {
    let resolvedName = actionName;
    if (!resolvedName) {
      for (const [key] of event.url.searchParams.entries()) {
        if (key.startsWith("/")) {
          resolvedName = key.slice(1);
          break;
        }
      }
    }
    if (!resolvedName) {
      resolvedName = "default";
    }
    targetAction = actionsOrAction[resolvedName];
    if (!targetAction) {
      return {
        type: "error",
        status: 404,
        error: { message: `Action "${resolvedName}" not found` },
      };
    }
  }

  try {
    const out = await withKitRequestEvent(event, () => targetAction(event));
    if (isActionFailure(out)) {
      setKitPage({
        status: out.status,
        form: out.data,
      });
      return {
        type: "failure",
        status: out.status,
        data: out.data as Failure,
      };
    }
    setKitPage({
      status: 200,
      form: out ?? null,
    });
    return {
      type: "success",
      status: 200,
      data: out as Success,
    };
  } catch (err) {
    if (isRedirect(err)) {
      return {
        type: "redirect",
        status: err.status,
        location: err.location,
      };
    }
    if (isHttpError(err)) {
      setKitPage({
        status: err.status,
        error: err.body,
      });
      return {
        type: "error",
        status: err.status,
        error: err.body,
      };
    }
    return {
      type: "error",
      status: 500,
      error:
        err instanceof Error
          ? { message: err.message }
          : { message: String(err) },
    };
  }
}
