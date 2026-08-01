import { PACKAGES } from "./packages";

/**
 * Public registries read from inside the Worker while the response is built.
 * Every function here is failure-tolerant: a registry that times out, rate
 * limits or changes shape degrades to `null`/an empty list, and the page says
 * so, rather than falling back to a version number baked into the bundle.
 */

const UA = "moonshine.tsc.hk (+https://github.com/tschk/moonshine)";

const REGISTRY_TIMEOUT_MS = 2500;

/** Cache upstream at the colo so a hot page does not hammer either registry. */
const CACHE: RequestInit = {
  cf: { cacheTtl: 300, cacheEverything: true },
} as RequestInit;

async function getJson<T>(
  url: string,
  headers: HeadersInit,
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...CACHE,
      headers,
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export type NpmVersion = {
  name: string;
  version: string | null;
};

export type NpmScopeSnapshot = {
  /** Packages the registry answered for, in `PACKAGES` order. */
  versions: NpmVersion[];
  /** How many of them the registry confirmed as published. */
  published: number;
  /** How many were asked about. */
  asked: number;
  /** Distinct published versions, newest string first. */
  distinct: string[];
  /** Milliseconds the whole fan-out took at the edge. */
  elapsedMs: number;
};

/**
 * `dist-tags` is the smallest document npm exposes per package, so the whole
 * `@tschk/*` set is one small fan-out rather than nineteen packuments.
 */
async function fetchDistTag(name: string): Promise<NpmVersion> {
  const encoded = name.replace("/", "%2F");
  const tags = await getJson<Record<string, string>>(
    `https://registry.npmjs.org/-/package/${encoded}/dist-tags`,
    { accept: "application/json" },
  );
  const latest = tags?.latest;
  return { name, version: typeof latest === "string" ? latest : null };
}

export async function fetchNpmScope(): Promise<NpmScopeSnapshot> {
  const startedAt = Date.now();
  const versions = await Promise.all(
    PACKAGES.map((entry) => fetchDistTag(entry.name)),
  );
  const published = versions.filter((entry) => entry.version !== null);
  const distinct = [...new Set(published.map((entry) => entry.version!))].sort(
    (a, b) => b.localeCompare(a, "en", { numeric: true }),
  );
  return {
    versions,
    published: published.length,
    asked: versions.length,
    distinct,
    elapsedMs: Date.now() - startedAt,
  };
}

export type CrateVersion = {
  name: string;
  version: string;
};

export type CratesSnapshot = {
  /** Published crepuscularity crates, alphabetical. Empty when unreachable. */
  crates: CrateVersion[];
  count: number;
  elapsedMs: number;
  /** False when crates.io could not be read; the page says so instead of lying. */
  ok: boolean;
};

type CratesResponse = {
  crates?: {
    name?: unknown;
    max_stable_version?: unknown;
    max_version?: unknown;
  }[];
};

/**
 * crates.io rejects requests without an identifying user agent, so one is sent
 * explicitly. One search request covers the whole family.
 */
export async function fetchCrepusCrates(): Promise<CratesSnapshot> {
  const startedAt = Date.now();
  const body = await getJson<CratesResponse>(
    "https://crates.io/api/v1/crates?q=crepuscularity&per_page=60",
    { accept: "application/json", "user-agent": UA },
  );
  if (!body || !Array.isArray(body.crates)) {
    return {
      crates: [],
      count: 0,
      elapsedMs: Date.now() - startedAt,
      ok: false,
    };
  }
  const crates: CrateVersion[] = [];
  for (const crate of body.crates) {
    const name = crate.name;
    const version = crate.max_stable_version ?? crate.max_version;
    if (typeof name !== "string" || typeof version !== "string") continue;
    if (!name.startsWith("crepuscularity")) continue;
    crates.push({ name, version });
  }
  crates.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return {
    crates,
    count: crates.length,
    elapsedMs: Date.now() - startedAt,
    ok: true,
  };
}
