/**
 * `next/headers` backed by the moonshine request context.
 *
 * Server only. The request is supplied by the renderer via
 * `runWithRequest`, which the moonshine server calls per request.
 *
 * ```ts
 * import { headers, cookies } from "@tschk/moonshine-next/headers";
 * ```
 */
import {
  getRequest,
  getResponseHeaders,
} from "@tschk/moonshine-framework/request";
export { runWithRequest } from "@tschk/moonshine-framework/request";

function current(): Request {
  const request = getRequest();
  if (!request) {
    throw new Error(
      "headers() was called outside a request. Wrap the render in runWithRequest().",
    );
  }
  return request;
}

export function headers(): Headers {
  return current().headers;
}

export type CookieEntry = { name: string; value: string };

function parseCookies(header: string | null): Map<string, string> {
  const jar = new Map<string, string>();
  if (!header) return jar;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Cookie values may contain literal percent signs or invalid URI sequences.
    }
    jar.set(name, value);
  }
  return jar;
}

export type CookieOptions = {
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  priority?: "low" | "medium" | "high";
  partitioned?: boolean;
};
export type CookieStore = {
  get(name: string): CookieEntry | undefined;
  getAll(name?: string): CookieEntry[];
  has(name: string): boolean;
  set(name: string, value: string, options?: CookieOptions): void;
  set(cookie: CookieEntry & CookieOptions): void;
  delete(
    cookie:
      string | ({ name: string } & Pick<CookieOptions, "path" | "domain">),
  ): void;
};

const responseJars = new WeakMap<Headers, Map<string, string>>();
function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  if (typeof name !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
    throw new TypeError("Invalid cookie name");
  if (typeof value !== "string")
    throw new TypeError("Cookie value must be a string");
  const allowed = [
    "domain",
    "path",
    "expires",
    "maxAge",
    "secure",
    "httpOnly",
    "sameSite",
    "priority",
    "partitioned",
  ];
  if (
    !options ||
    typeof options !== "object" ||
    Object.keys(options).some((key) => !allowed.includes(key))
  )
    throw new TypeError("Unsupported cookie options");
  for (const key of ["secure", "httpOnly", "partitioned"] as const)
    if (options[key] !== undefined && typeof options[key] !== "boolean")
      throw new TypeError("Cookie flags must be boolean");
  const parts = [name + "=" + encodeURIComponent(value)];
  if (options.domain !== undefined) {
    if (
      typeof options.domain !== "string" ||
      !/^\.?(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(
        options.domain,
      )
    )
      throw new TypeError("Invalid cookie domain");
    parts.push("Domain=" + options.domain);
  }
  const path = options.path ?? "/";
  if (typeof path !== "string" || !/^[\x20-\x3a\x3c-\x7e]*$/.test(path))
    throw new TypeError("Invalid cookie path");
  if (path) parts.push("Path=" + path);
  if (options.expires !== undefined) {
    if (
      !(options.expires instanceof Date) ||
      !Number.isFinite(options.expires.getTime())
    )
      throw new TypeError("Invalid cookie expiry");
    parts.push("Expires=" + options.expires.toUTCString());
  }
  if (options.maxAge !== undefined) {
    if (!Number.isSafeInteger(options.maxAge))
      throw new TypeError("Invalid cookie maxAge");
    parts.push("Max-Age=" + options.maxAge);
  }
  if (options.secure) parts.push("Secure");
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite !== undefined && options.sameSite !== false) {
    const policy = options.sameSite === true ? "strict" : options.sameSite;
    if (!["lax", "strict", "none"].includes(policy))
      throw new TypeError("Invalid cookie sameSite");
    parts.push("SameSite=" + policy[0]!.toUpperCase() + policy.slice(1));
  }
  if (options.priority !== undefined) {
    if (!["low", "medium", "high"].includes(options.priority))
      throw new TypeError("Invalid cookie priority");
    parts.push(
      "Priority=" +
        options.priority[0]!.toUpperCase() +
        options.priority.slice(1),
    );
  }
  if (options.partitioned) parts.push("Partitioned");
  return parts.join("; ");
}

export function cookies(): CookieStore {
  const request = current();
  const sink = getResponseHeaders();
  let jar = sink && responseJars.get(sink);
  if (!jar) {
    jar = parseCookies(request.headers.get("cookie"));
    if (sink) responseJars.set(sink, jar);
  }
  const values = jar;
  function set(
    name: string | (CookieEntry & CookieOptions),
    value?: string,
    options: CookieOptions = {},
  ): void {
    if (!sink)
      throw new Error("Cookie mutation requires a response request scope");
    if (typeof name !== "string") {
      const { name: key, value: next, ...rest } = name;
      set(key, next, rest);
      return;
    }
    const serialized = serializeCookie(name, value!, options);
    sink.append("set-cookie", serialized);
    values.set(name, value!);
  }
  return {
    get: (name) => {
      const value = values.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: (filter) =>
      [...values]
        .filter(([key]) => filter === undefined || key === filter)
        .map(([name, value]) => ({ name, value })),
    has: (name) => values.has(name),
    set,
    delete: (cookie) => {
      const { name, ...options } =
        typeof cookie === "string" ? { name: cookie } : cookie;
      set(name, "", { ...options, expires: new Date(0), maxAge: 0 });
    },
  };
}

export function draftMode(): { isEnabled: boolean } {
  return { isEnabled: false };
}
