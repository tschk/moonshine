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

export type DownloadPoint = {
  /** ISO `YYYY-MM-DD`, UTC. */
  date: string;
  downloads: number;
};

export type DownloadSeries = {
  /** Registry the numbers came from, shown to the reader. */
  source: string;
  /** Package or crate the numbers are for. */
  subject: string;
  /** One entry per day, oldest first. Empty when the registry had nothing. */
  points: DownloadPoint[];
  total: number;
  peak: number;
  elapsedMs: number;
  /** False when the endpoint errored or answered in an unexpected shape. */
  ok: boolean;
};

const DOWNLOAD_WINDOW_DAYS = 30;

function unavailable(
  source: string,
  subject: string,
  startedAt: number,
): DownloadSeries {
  return {
    source,
    subject,
    points: [],
    total: 0,
    peak: 0,
    elapsedMs: Date.now() - startedAt,
    ok: false,
  };
}

function summarise(
  source: string,
  subject: string,
  points: DownloadPoint[],
  startedAt: number,
): DownloadSeries {
  let total = 0;
  let peak = 0;
  for (const point of points) {
    total += point.downloads;
    if (point.downloads > peak) peak = point.downloads;
  }
  return {
    source,
    subject,
    points,
    total,
    peak,
    elapsedMs: Date.now() - startedAt,
    ok: true,
  };
}

type NpmRangeResponse = {
  downloads?: { day?: unknown; downloads?: unknown }[];
};

/**
 * npm's download API, queried the way npm-stat.com queries it: an explicit
 * `range/{from}:{until}/{package}` window rather than the `last-month` alias,
 * one request per package because bulk queries do not accept scoped names.
 *
 * Two behaviours of that API drive the shape here. It omits days with no
 * downloads entirely, so missing days are filled with a real zero rather than
 * left as gaps in the line. And it answers 404 for a package it holds no
 * statistics for at all — the normal state for a package that has just been
 * published — which is treated as "this package contributed nothing" instead
 * of failing the whole chart, so one silent package cannot blank the others.
 *
 * The series returned is the sum across `names`, which is what "downloads of
 * moonshine" means when the runtime ships as a scope rather than one package.
 */
export async function fetchNpmDownloads(
  names: string[] = PACKAGES.map((entry) => entry.name),
  subject = "@tschk/*",
): Promise<DownloadSeries> {
  const startedAt = Date.now();
  const dates = windowDates(DOWNLOAD_WINDOW_DAYS);
  const from = dates[0]!;
  const until = dates[dates.length - 1]!;

  const bodies = await Promise.all(
    names.map((name) =>
      getJson<NpmRangeResponse>(
        `https://api.npmjs.org/downloads/range/${from}:${until}/${name}`,
        { accept: "application/json" },
      ),
    ),
  );

  const daily = new Map<string, number>();
  let answered = 0;
  for (const body of bodies) {
    if (!body || !Array.isArray(body.downloads)) continue;
    answered += 1;
    for (const entry of body.downloads) {
      if (typeof entry.day !== "string") continue;
      if (typeof entry.downloads !== "number") continue;
      daily.set(entry.day, (daily.get(entry.day) ?? 0) + entry.downloads);
    }
  }

  // Every package 404ing means the statistics service knows nothing about the
  // scope, which is different from a scope that was downloaded zero times.
  if (answered === 0) return unavailable("npm", subject, startedAt);

  const points = dates.map((date) => ({
    date,
    downloads: daily.get(date) ?? 0,
  }));
  return summarise("npm", subject, points, startedAt);
}

type CrateDownloadsResponse = {
  version_downloads?: { date?: unknown; downloads?: unknown }[];
  meta?: { extra_downloads?: { date?: unknown; downloads?: unknown }[] };
};

function addDaily(
  into: Map<string, number>,
  rows: { date?: unknown; downloads?: unknown }[] | undefined,
): void {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (typeof row.date !== "string") continue;
    if (typeof row.downloads !== "number") continue;
    into.set(row.date, (into.get(row.date) ?? 0) + row.downloads);
  }
}

/** The last `DOWNLOAD_WINDOW_DAYS` dates ending today, UTC, oldest first. */
function windowDates(days: number): string[] {
  const today = Date.now();
  const dates: string[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    dates.push(new Date(today - back * 86_400_000).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * crates.io reports per-version rows plus an `extra_downloads` roll-up for
 * versions it no longer breaks out, and omits days with no downloads entirely.
 * Both are summed per date and the omitted days are filled with a real zero —
 * an absent date on that API means nobody downloaded the crate that day.
 * The identifying user agent is required: without it crates.io answers 403,
 * which is indistinguishable from "no data" at the call site.
 */
export async function fetchCrateDownloads(
  name = "crepuscularity",
): Promise<DownloadSeries> {
  const startedAt = Date.now();
  const body = await getJson<CrateDownloadsResponse>(
    `https://crates.io/api/v1/crates/${name}/downloads`,
    { accept: "application/json", "user-agent": UA },
  );
  if (!body || !Array.isArray(body.version_downloads)) {
    return unavailable("crates.io", name, startedAt);
  }
  const daily = new Map<string, number>();
  addDaily(daily, body.version_downloads);
  addDaily(daily, body.meta?.extra_downloads);
  const points = windowDates(DOWNLOAD_WINDOW_DAYS).map((date) => ({
    date,
    downloads: daily.get(date) ?? 0,
  }));
  return summarise("crates.io", name, points, startedAt);
}
