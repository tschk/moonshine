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
import { getRequest } from "@tschk/moonshine-framework/request";
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
