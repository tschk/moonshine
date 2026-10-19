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

export type ValidRedirectStatus =
  300 | 301 | 302 | 303 | 304 | 307 | 308 | number;

export interface AstroResponseInit {
  status: number;
  statusText: string;
  headers: Headers;
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
  site: URL | undefined;
  generator: string;
  clientAddress: string;
  response: AstroResponseInit;
  originPathname: string;
  isPrerendered: boolean;
  preferredLocale: string | undefined;
  preferredLocaleList: string[] | undefined;
  currentLocale: string | undefined;
  redirect(path: string, status?: ValidRedirectStatus): Response;
  rewrite(reroutePayload: string | URL | Request): Promise<Response>;
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
  site?: URL | string;
  generator?: string;
  clientAddress?: string;
  response?: Partial<AstroResponseInit>;
  originPathname?: string;
  isPrerendered?: boolean;
  preferredLocale?: string;
  preferredLocaleList?: string[];
  currentLocale?: string;
  rewriteHandler?: (
    target: URL,
    request: Request,
  ) => Response | Promise<Response>;
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

  return {
    props: (init.props ?? {}) as Props,
    request,
    url: resolvedUrl,
    params: (init.params ?? {}) as Params,
    locals: (init.locals ?? {}) as Locals,
    cookies,
    site,
    generator: init.generator ?? "Moonshine Astro",
    clientAddress:
      init.clientAddress ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "127.0.0.1",
    response,
    originPathname: init.originPathname ?? resolvedUrl.pathname,
    isPrerendered: init.isPrerendered ?? false,
    preferredLocale: init.preferredLocale,
    preferredLocaleList: init.preferredLocaleList,
    currentLocale: init.currentLocale,
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
  };
}

let activeAstroContext: AstroGlobal<any, any, any> | undefined;

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
