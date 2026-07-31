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
import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<Request>();

/** Runs `fn` with `request` visible to `headers()` and `cookies()`. */
export function runWithRequest<T>(request: Request, fn: () => T): T {
  return store.run(request, fn);
}

function current(): Request {
  const request = store.getStore();
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
    if (name) jar.set(name, decodeURIComponent(part.slice(index + 1).trim()));
  }
  return jar;
}

export function cookies(): {
  get(name: string): CookieEntry | undefined;
  getAll(): CookieEntry[];
  has(name: string): boolean;
} {
  const jar = parseCookies(current().headers.get("cookie"));
  return {
    get: (name) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    has: (name) => jar.has(name),
  };
}

export function draftMode(): { isEnabled: boolean } {
  return { isEnabled: false };
}
