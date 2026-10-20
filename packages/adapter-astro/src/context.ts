/** Independent host-free Astro request context, cookies, and global helpers. */

export interface AstroCookieGetOptions {
  decode?: (value: string) => string;
}

export interface AstroCookieSetOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | "lax" | "none" | "strict" | "Lax" | "None" | "Strict";
  secure?: boolean;
  partitioned?: boolean;
  encode?: (value: string) => string;
}

export interface AstroCookieDeleteOptions {
  domain?: string;
  path?: string;
}

export class AstroCookie {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  json<T = Record<string, unknown>>(): T {
    if (this.value === undefined) {
      throw new Error("Cannot convert undefined cookie to JSON.");
    }
    return JSON.parse(this.value) as T;
  }

  number(): number {
    return Number(this.value);
  }

  boolean(): boolean {
    if (this.value === "false") return false;
    if (this.value === "0") return false;
    return Boolean(this.value);
  }
}

interface OutgoingCookie {
  value: string;
  options?: AstroCookieSetOptions;
  isDeleted: boolean;
}

function defaultDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(header: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (!key) continue;
    let rawVal = part.slice(eqIdx + 1).trim();
    if (rawVal.length >= 2 && rawVal.startsWith('"') && rawVal.endsWith('"')) {
      rawVal = rawVal.slice(1, -1);
    }
    if (!map.has(key)) {
      map.set(key, rawVal);
    }
  }
  return map;
}

function serializeSetCookie(
  key: string,
  value: string,
  options: AstroCookieSetOptions = {},
): string {
  const encode = options.encode ?? encodeURIComponent;
  const segments = [`${key}=${encode(value)}`];
  if (options.maxAge !== undefined && Number.isFinite(options.maxAge)) {
    segments.push(`Max-Age=${Math.trunc(options.maxAge)}`);
  }
  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }
  if (options.path) {
    segments.push(`Path=${options.path}`);
  }
  if (options.expires instanceof Date) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.httpOnly) {
    segments.push("HttpOnly");
  }
  if (options.secure) {
    segments.push("Secure");
  }
  if (options.sameSite !== undefined && options.sameSite !== false) {
    const mode =
      options.sameSite === true
        ? "Strict"
        : options.sameSite.charAt(0).toUpperCase() +
          options.sameSite.slice(1).toLowerCase();
    segments.push(`SameSite=${mode}`);
  }
  if (options.partitioned) {
    segments.push("Partitioned");
  }
  return segments.join("; ");
}

export class AstroCookies {
  readonly #incoming: Map<string, string>;
  readonly #outgoing = new Map<string, OutgoingCookie>();

  constructor(
    source?: Request | Headers | string | Record<string, string> | null,
  ) {
    if (!source) {
      this.#incoming = new Map();
    } else if (typeof source === "string") {
      this.#incoming = parseCookieHeader(source);
    } else if (source instanceof Request) {
      this.#incoming = parseCookieHeader(source.headers.get("cookie") ?? "");
    } else if (source instanceof Headers) {
      this.#incoming = parseCookieHeader(source.get("cookie") ?? "");
    } else {
      this.#incoming = new Map(Object.entries(source));
    }
  }

  get(key: string, options?: AstroCookieGetOptions): AstroCookie | undefined {
    const outgoing = this.#outgoing.get(key);
    if (outgoing) {
      if (outgoing.isDeleted) return undefined;
      return new AstroCookie(outgoing.value);
    }
    const rawVal = this.#incoming.get(key);
    if (rawVal === undefined) return undefined;
    const decode = options?.decode ?? defaultDecode;
    return new AstroCookie(decode(rawVal));
  }

  has(key: string, _options?: AstroCookieGetOptions): boolean {
    const outgoing = this.#outgoing.get(key);
    if (outgoing) return !outgoing.isDeleted;
    return this.#incoming.has(key);
  }

  set(
    key: string,
    value: string | number | boolean | Record<string, unknown>,
    options?: AstroCookieSetOptions,
  ): void {
    const serializedValue =
      typeof value === "string" ? value : JSON.stringify(value);
    this.#outgoing.set(key, {
      value: serializedValue,
      options,
      isDeleted: false,
    });
  }

  delete(key: string, options?: AstroCookieDeleteOptions): void {
    this.#outgoing.set(key, {
      value: "",
      options: {
        ...options,
        expires: new Date(0),
        maxAge: 0,
      },
      isDeleted: true,
    });
  }

  merge(cookies: AstroCookies): void {
    for (const [key, entry] of cookies.#outgoing.entries()) {
      this.#outgoing.set(key, entry);
    }
  }

  *headers(): Generator<string, void, unknown> {
    for (const [key, entry] of this.#outgoing.entries()) {
      yield serializeSetCookie(key, entry.value, entry.options);
    }
  }
}

export interface AstroSessionOptions {
  cookie?: string;
  cookieOptions?: AstroCookieSetOptions;
  ttl?: number;
}

interface SessionEntry {
  value: unknown;
  expiresAt?: number;
}

const SESSION_STORE = /* @__PURE__ */ new Map<
  string,
  Map<string, SessionEntry>
>();

let sessionIdCounter = 0;

function generateSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `astro_sess_${Date.now()}_${++sessionIdCounter}`;
}

export function clearAstroSessions(): void {
  SESSION_STORE.clear();
}

export class AstroSession {
  readonly #cookies: AstroCookies;
  readonly #cookieName: string;
  readonly #cookieOptions: AstroCookieSetOptions;
  readonly #defaultTtl?: number;
  #sessionID: string;
  #destroyed = false;

  constructor(cookies: AstroCookies, options: AstroSessionOptions = {}) {
    this.#cookies = cookies;
    this.#cookieName = options.cookie ?? "astro-session";
    this.#cookieOptions = options.cookieOptions ?? {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    };
    this.#defaultTtl = options.ttl;
    const existing = cookies.get(this.#cookieName)?.value;
    if (existing) {
      this.#sessionID = existing;
    } else {
      this.#sessionID = generateSessionId();
    }
  }

  get sessionID(): string {
    return this.#sessionID;
  }

  #ensureBucket(): Map<string, SessionEntry> {
    let bucket = SESSION_STORE.get(this.#sessionID);
    if (!bucket) {
      bucket = new Map();
      SESSION_STORE.set(this.#sessionID, bucket);
    }
    return bucket;
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (this.#destroyed) return undefined;
    const bucket = SESSION_STORE.get(this.#sessionID);
    if (!bucket) return undefined;
    const entry = bucket.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      bucket.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async keys(): Promise<string[]> {
    if (this.#destroyed) return [];
    const bucket = SESSION_STORE.get(this.#sessionID);
    if (!bucket) return [];
    const now = Date.now();
    const out: string[] = [];
    for (const [k, entry] of bucket.entries()) {
      if (entry.expiresAt !== undefined && now > entry.expiresAt) {
        bucket.delete(k);
        continue;
      }
      out.push(k);
    }
    return out;
  }

  async entries(): Promise<Record<string, unknown>> {
    if (this.#destroyed) return {};
    const bucket = SESSION_STORE.get(this.#sessionID);
    if (!bucket) return {};
    const now = Date.now();
    const out: Record<string, unknown> = {};
    for (const [k, entry] of bucket.entries()) {
      if (entry.expiresAt !== undefined && now > entry.expiresAt) {
        bucket.delete(k);
        continue;
      }
      out[k] = entry.value;
    }
    return out;
  }

  set(key: string, value: any, options?: { ttl?: number }): void {
    this.#destroyed = false;
    const bucket = this.#ensureBucket();
    const ttlSeconds = options?.ttl ?? this.#defaultTtl;
    const expiresAt =
      ttlSeconds !== undefined && Number.isFinite(ttlSeconds)
        ? Date.now() + ttlSeconds * 1000
        : undefined;
    bucket.set(key, { value, expiresAt });
    this.#cookies.set(this.#cookieName, this.#sessionID, this.#cookieOptions);
  }

  delete(key: string): void {
    const bucket = SESSION_STORE.get(this.#sessionID);
    bucket?.delete(key);
  }

  async regenerate(): Promise<void> {
    const oldBucket = SESSION_STORE.get(this.#sessionID);
    const cloned = new Map<string, SessionEntry>(oldBucket ? oldBucket : []);
    SESSION_STORE.delete(this.#sessionID);
    this.#sessionID = generateSessionId();
    SESSION_STORE.set(this.#sessionID, cloned);
    this.#destroyed = false;
    this.#cookies.set(this.#cookieName, this.#sessionID, this.#cookieOptions);
  }

  destroy(): void {
    SESSION_STORE.delete(this.#sessionID);
    this.#destroyed = true;
    this.#cookies.delete(this.#cookieName, {
      path: this.#cookieOptions.path ?? "/",
      domain: this.#cookieOptions.domain,
    });
  }

  async load(sessionID: string): Promise<void> {
    this.#sessionID = sessionID;
    this.#destroyed = false;
    this.#cookies.set(this.#cookieName, this.#sessionID, this.#cookieOptions);
  }
}

export type ValidRedirectStatus =
  300 | 301 | 302 | 303 | 304 | 307 | 308 | number;

export interface AstroResponseInit {
  status: number;
  statusText: string;
  headers: Headers;
}

export type AstroSlotValue =
  string | number | boolean | null | undefined | ((...args: any[]) => unknown);

export interface AstroSlots {
  has(name: string): boolean;
  render(name: string, args?: unknown[]): Promise<string>;
}

export interface AstroActionCallable<TInput = any, TResult = any> {
  (input?: TInput): Promise<TResult>;
  readonly queryString?: string;
}

export interface AstroServerIslandEntry {
  id: string;
  componentName: string;
  props: Record<string, unknown>;
  hasFallback: boolean;
  deferred: boolean;
  render: () => string;
}

export interface AstroGlobal<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
> {
  props: Props;
  request: Request;
  url: URL;
  params: Params;
  locals: Locals;
  cookies: AstroCookies;
  session: AstroSession;
  slots: AstroSlots;
  site: URL | undefined;
  generator: string;
  clientAddress: string;
  response: AstroResponseInit;
  originPathname: string;
  routePattern: string;
  isPrerendered: boolean;
  preferredLocale: string | undefined;
  preferredLocaleList: string[] | undefined;
  currentLocale: string | undefined;
  deferServerIslands: boolean;
  serverIslands: AstroServerIslandEntry[];
  resolveServerIsland(id: string): string | undefined;
  resolveAllServerIslands(html: string): string;
  redirect(path: string, status?: ValidRedirectStatus): Response;
  rewrite(reroutePayload: string | URL | Request): Promise<Response>;
  callAction<TAction extends AstroActionCallable<any, any>>(
    action: TAction,
    ...args: Parameters<TAction>
  ): Promise<Awaited<ReturnType<TAction>>>;
  getActionResult<TAction extends AstroActionCallable<any, any>>(
    action: TAction | string,
  ): Awaited<ReturnType<TAction>> | undefined;
}

export interface AstroContextInit<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
> {
  props?: Props;
  request?: Request;
  url?: URL | string;
  params?: Params;
  locals?: Locals;
  cookies?: AstroCookies;
  session?: AstroSession;
  sessionOptions?: AstroSessionOptions;
  slots?: Record<string, AstroSlotValue>;
  site?: URL | string;
  generator?: string;
  clientAddress?: string;
  response?: Partial<AstroResponseInit>;
  originPathname?: string;
  routePattern?: string;
  isPrerendered?: boolean;
  preferredLocale?: string;
  preferredLocaleList?: string[];
  currentLocale?: string;
  deferServerIslands?: boolean;
  actionResults?: Map<unknown, unknown> | Record<string, unknown>;
  rewriteHandler?: (
    target: URL,
    request: Request,
  ) => Response | Promise<Response>;
}

const ACTION_RESULTS_SYMBOL = Symbol.for("moonshine.astro.actionResults");

export function recordAstroActionResult(
  actionKey: unknown,
  result: unknown,
  astro?: AstroGlobal<any, any, any>,
): void {
  const ctx = astro ?? activeAstroContext;
  if (!ctx) return;
  const store = (ctx as any)[ACTION_RESULTS_SYMBOL] as
    Map<unknown, unknown> | undefined;
  if (!store) return;
  store.set(actionKey, result);
  const queryString =
    typeof actionKey === "function" ||
    (typeof actionKey === "object" && actionKey !== null)
      ? (actionKey as { queryString?: string }).queryString
      : typeof actionKey === "string"
        ? actionKey.startsWith("?_action=")
          ? actionKey
          : `?_action=${encodeURIComponent(actionKey)}`
        : undefined;
  if (queryString) {
    store.set(queryString, result);
    const rawName = queryString.startsWith("?_action=")
      ? decodeURIComponent(queryString.slice("?_action=".length))
      : queryString;
    store.set(rawName, result);
  }
}

function createAstroSlots(
  rawSlots: Record<string, AstroSlotValue> = {},
): AstroSlots {
  return {
    has(name: string): boolean {
      return (
        Object.hasOwn(rawSlots, name) &&
        rawSlots[name] !== undefined &&
        rawSlots[name] !== null &&
        rawSlots[name] !== false
      );
    },
    async render(name: string, args: unknown[] = []): Promise<string> {
      if (!Object.hasOwn(rawSlots, name)) return "";
      const slot = rawSlots[name];
      const resolved =
        typeof slot === "function" ? await slot(...args) : await slot;
      if (resolved === undefined || resolved === null || resolved === false) {
        return "";
      }
      return String(resolved);
    },
  };
}

export function createAstroGlobal<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
>(
  init: AstroContextInit<Props, Params, Locals> = {},
): AstroGlobal<Props, Params, Locals> {
  const resolvedUrl =
    init.url instanceof URL
      ? init.url
      : typeof init.url === "string"
        ? new URL(init.url, "http://localhost")
        : init.request
          ? new URL(init.request.url)
          : new URL("http://localhost/");
  const request = init.request ?? new Request(resolvedUrl.href);
  const cookies = init.cookies ?? new AstroCookies(request);
  const session =
    init.session ?? new AstroSession(cookies, init.sessionOptions);
  const slots = createAstroSlots(init.slots);
  const site =
    init.site instanceof URL
      ? init.site
      : typeof init.site === "string"
        ? new URL(init.site)
        : undefined;
  const responseHeaders =
    init.response?.headers instanceof Headers
      ? init.response.headers
      : new Headers(init.response?.headers);
  const response: AstroResponseInit = {
    status: init.response?.status ?? 200,
    statusText: init.response?.statusText ?? "OK",
    headers: responseHeaders,
  };

  const actionResults = new Map<unknown, unknown>();
  if (init.actionResults instanceof Map) {
    for (const [k, v] of init.actionResults.entries()) {
      actionResults.set(k, v);
    }
  } else if (init.actionResults && typeof init.actionResults === "object") {
    for (const [k, v] of Object.entries(init.actionResults)) {
      actionResults.set(k, v);
      actionResults.set(`?_action=${encodeURIComponent(k)}`, v);
    }
  }

  const serverIslands: AstroServerIslandEntry[] = [];

  const astro: AstroGlobal<Props, Params, Locals> = {
    props: (init.props ?? {}) as Props,
    request,
    url: resolvedUrl,
    params: (init.params ?? {}) as Params,
    locals: (init.locals ?? {}) as Locals,
    cookies,
    session,
    slots,
    site,
    generator: init.generator ?? "Moonshine Astro",
    clientAddress:
      init.clientAddress ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "127.0.0.1",
    response,
    originPathname: init.originPathname ?? resolvedUrl.pathname,
    routePattern: init.routePattern ?? resolvedUrl.pathname,
    isPrerendered: init.isPrerendered ?? false,
    preferredLocale: init.preferredLocale,
    preferredLocaleList: init.preferredLocaleList,
    currentLocale: init.currentLocale,
    deferServerIslands: init.deferServerIslands ?? false,
    serverIslands,
    resolveServerIsland(id: string): string | undefined {
      const entry = serverIslands.find((island) => island.id === id);
      if (!entry) return undefined;
      return withAstroContext(astro, () => entry.render());
    },
    resolveAllServerIslands(html: string): string {
      let output = html;
      for (const entry of serverIslands) {
        const pattern = new RegExp(
          `<astro-server-island[^>]*data-island-id="${entry.id}"[^>]*>[\\s\\S]*?<\\/astro-server-island>`,
          "g",
        );
        if (pattern.test(output)) {
          const rendered = withAstroContext(astro, () => entry.render());
          output = output.replace(pattern, () => rendered);
        }
      }
      return output;
    },
    redirect(path: string, status: ValidRedirectStatus = 302): Response {
      const headers = new Headers(response.headers);
      headers.set("Location", path);
      for (const cookieHeader of cookies.headers()) {
        headers.append("Set-Cookie", cookieHeader);
      }
      return new Response(null, { status, headers });
    },
    async rewrite(reroutePayload: string | URL | Request): Promise<Response> {
      const targetUrl =
        typeof reroutePayload === "string"
          ? new URL(reroutePayload, resolvedUrl)
          : reroutePayload instanceof URL
            ? reroutePayload
            : new URL(reroutePayload.url);
      const nextRequest =
        reroutePayload instanceof Request
          ? reroutePayload
          : new Request(targetUrl.href, request);
      if (init.rewriteHandler) {
        return await init.rewriteHandler(targetUrl, nextRequest);
      }
      const headers = new Headers(response.headers);
      headers.set("x-astro-rewrite", targetUrl.pathname + targetUrl.search);
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    async callAction<TAction extends AstroActionCallable<any, any>>(
      action: TAction,
      ...args: Parameters<TAction>
    ): Promise<Awaited<ReturnType<TAction>>> {
      const res = await withAstroContext(astro, () =>
        action(...(args as [any?])),
      );
      recordAstroActionResult(action, res, astro);
      return res as Awaited<ReturnType<TAction>>;
    },
    getActionResult<TAction extends AstroActionCallable<any, any>>(
      action: TAction | string,
    ): Awaited<ReturnType<TAction>> | undefined {
      if (actionResults.has(action)) {
        return actionResults.get(action) as Awaited<ReturnType<TAction>>;
      }
      const queryString =
        typeof action === "function" ||
        (typeof action === "object" && action !== null)
          ? (action as { queryString?: string }).queryString
          : typeof action === "string"
            ? action
            : undefined;
      if (queryString && actionResults.has(queryString)) {
        return actionResults.get(queryString) as Awaited<ReturnType<TAction>>;
      }
      return undefined;
    },
  };

  Object.defineProperty(astro, ACTION_RESULTS_SYMBOL, {
    value: actionResults,
    enumerable: false,
  });

  return astro;
}

let activeAstroContext: AstroGlobal<any, any, any> | undefined;

export function peekAstroContext(): AstroGlobal<any, any, any> | undefined {
  return activeAstroContext;
}

function isAstroGlobal(value: unknown): value is AstroGlobal<any, any, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    "cookies" in value &&
    (value as AstroGlobal).cookies instanceof AstroCookies &&
    typeof (value as AstroGlobal).redirect === "function"
  );
}

export function withAstroContext<
  T,
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
>(
  initOrContext:
    | AstroGlobal<Props, Params, Locals>
    | AstroContextInit<Props, Params, Locals>,
  fn: (astro: AstroGlobal<Props, Params, Locals>) => T,
): T {
  const astro = isAstroGlobal(initOrContext)
    ? initOrContext
    : createAstroGlobal(initOrContext);
  const previous = activeAstroContext;
  activeAstroContext = astro;
  try {
    const result = fn(astro);
    if (
      result !== null &&
      typeof result === "object" &&
      typeof (result as { then?: unknown }).then === "function"
    ) {
      return Promise.resolve(result).finally(() => {
        if (activeAstroContext === astro) {
          activeAstroContext = previous;
        }
      }) as T;
    }
    activeAstroContext = previous;
    return result;
  } catch (error) {
    activeAstroContext = previous;
    throw error;
  }
}

export function useAstro<
  Props extends Record<string, any> = Record<string, any>,
  Params extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
  Locals extends Record<string, any> = Record<string, any>,
>(): AstroGlobal<Props, Params, Locals> {
  return (activeAstroContext ?? createAstroGlobal()) as AstroGlobal<
    Props,
    Params,
    Locals
  >;
}
