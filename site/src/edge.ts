/**
 * Per-request facts gathered inside the Worker. Everything here is read at
 * request time, so two consecutive responses never match.
 */

export type EdgeFacts = {
  /** Cloudflare colo (airport code) that terminated the request. */
  colo: string;
  country: string;
  city: string;
  region: string;
  protocol: string;
  tlsVersion: string;
  /** ISO timestamp of this render. */
  renderedAt: string;
  /** Requests this isolate has served, including this one. */
  isolateRequests: number;
  /** Milliseconds since this isolate started. */
  isolateAgeMs: number;
  /** Nanosecond-ish monotonic reading, proving the render is not cached HTML. */
  renderNonce: string;
  /** Latest `@tschk/moonshine` on npm, fetched at the edge. */
  npmLatest: string | null;
};

type IncomingCf = {
  colo?: string;
  country?: string;
  city?: string;
  region?: string;
  httpProtocol?: string;
  tlsVersion?: string;
};

/**
 * Workers freeze the clock outside a request, so `Date.now()` at module scope
 * answers 0. The isolate's start is stamped on the first request instead.
 */
let bootedAt = 0;
let served = 0;

export function nextRequestNumber(): number {
  return ++served;
}

export function isolateAgeMs(): number {
  const now = Date.now();
  if (bootedAt === 0) bootedAt = now;
  return now - bootedAt;
}

const NPM_LATEST_URL = "https://registry.npmjs.org/@tschk%2Fmoonshine/latest";

/**
 * The registry is a third party on the request path, so it gets a short
 * timeout and a null fallback rather than the power to fail the page.
 */
export async function fetchNpmLatest(): Promise<string | null> {
  try {
    const response = await fetch(NPM_LATEST_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2000),
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: string };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

export async function readEdgeFacts(request: Request): Promise<EdgeFacts> {
  const cf = (request as Request & { cf?: IncomingCf }).cf ?? {};
  const npmLatest = await fetchNpmLatest();
  return {
    colo: cf.colo ?? "local",
    country: cf.country ?? "—",
    city: cf.city ?? "—",
    region: cf.region ?? "—",
    protocol: cf.httpProtocol ?? "HTTP/1.1",
    tlsVersion: cf.tlsVersion ?? "none",
    renderedAt: new Date().toISOString(),
    isolateRequests: nextRequestNumber(),
    isolateAgeMs: isolateAgeMs(),
    renderNonce: Math.random().toString(36).slice(2, 10),
    npmLatest,
  };
}

const HTML_ESCAPE = /[<>&\u2028\u2029]/g;

/** JSON safe to drop inside a `<script type="application/json">` body. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null).replace(
    HTML_ESCAPE,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
