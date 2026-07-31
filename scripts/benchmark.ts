import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  MANIFEST_VERSION,
  type MoonshineManifest,
  type Renderer,
  type RouteArtifact,
  type RuntimeTarget,
} from "@tschk/moonshine-framework";
import {
  analyzeModule,
  buildProject,
  classifyRoute,
  discoverRoutes,
} from "@tschk/moonshine-compiler";
import { toPosix } from "../packages/compiler/src/path.js";
import { createBunServer } from "@tschk/moonshine-deploy-bun";
import { createRequestHandler } from "@tschk/moonshine-server";

type BenchmarkRow = {
  routes: number;
  discover: number;
  classify: number;
  manifest: number;
  coldBuild: number;
  incrementalBuild: number;
  serverStartup: number;
  staticRequest: number;
  ssrRequest: number;
};

function toProjectRelative(projectDir: string, p: string): string {
  const rel = toPosix(relative(projectDir, resolve(p)));
  return rel.startsWith("..") ? toPosix(p) : rel || ".";
}

function makeStaticOutput(route: RouteArtifact): string | undefined {
  if (route.mode !== "static") return undefined;
  if (route.path.includes("*")) return undefined;
  const slug =
    route.path === "/"
      ? "index"
      : route.path.replace(/^\/+/, "").replace(/\//g, "-");
  return `static/${slug}.html`;
}

function deriveCapabilities(
  routes: RouteArtifact[],
): MoonshineManifest["capabilities"] {
  const capabilities = new Set<MoonshineManifest["capabilities"][number]>();
  capabilities.add("streaming");
  for (const route of routes) {
    if (route.mode === "island" || route.mode === "spa") {
      capabilities.add("islands");
    }
    if (route.runtime === "cloudflare" || route.runtime === "vercel-edge") {
      capabilities.add("edge");
    }
    if (route.cache?.revalidate !== undefined) {
      capabilities.add("revalidation");
    }
  }
  return [...capabilities].sort();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function makeFixture(root: string, count: number): Promise<string> {
  const routesDir = resolve(root, "src", "routes");
  await mkdir(routesDir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const name = i === 0 ? "index.tsx" : `page${i}.tsx`;
    const source = `export function loader() { return { ok: true }; }\nexport default function Page() { return <h1>Page ${i}</h1>; }\n`;
    await writeFile(resolve(routesDir, name), source);
  }
  return routesDir;
}

async function generateManifest(
  projectDir: string,
  count: number,
  runtime: RuntimeTarget,
): Promise<MoonshineManifest> {
  const routesDir = resolve(projectDir, "src", "routes");
  const raw = await discoverRoutes({ routesDir });
  const buildRoutes: RouteArtifact[] = [];
  for (const route of raw) {
    const facts = analyzeModule(route.file);
    const decision = classifyRoute({ explicit: route.mode, facts });
    buildRoutes.push({
      ...route,
      mode: decision.mode,
      runtime: route.runtime ?? runtime,
      decision: decision.reason,
      clientEntries: [],
      serverEntry: undefined,
      staticOutput: makeStaticOutput({
        ...route,
        mode: decision.mode,
      } as RouteArtifact),
    } as RouteArtifact);
  }
  const clientFile = buildRoutes.some(
    (r) => r.mode === "island" || r.mode === "spa",
  )
    ? "dist/client.js"
    : undefined;
  for (const route of buildRoutes) {
    if ((route.mode === "island" || route.mode === "spa") && clientFile) {
      route.clientEntries = [clientFile];
    }
    route.serverEntry = "dist/server.js";
  }
  return {
    version: MANIFEST_VERSION,
    frameworkVersion: "0.3.0",
    routes: buildRoutes.map((route) => ({
      ...route,
      file: toProjectRelative(projectDir, route.file),
      ...(route.dataFile && {
        dataFile: toProjectRelative(projectDir, route.dataFile),
      }),
      ...(route.layouts && {
        layouts: route.layouts.map((l) => toProjectRelative(projectDir, l)),
      }),
      ...(route.middleware && {
        middleware: route.middleware.map((m) =>
          toProjectRelative(projectDir, m),
        ),
      }),
      ...(route.errorBoundary && {
        errorBoundary: toProjectRelative(projectDir, route.errorBoundary),
      }),
    })) as RouteArtifact[],
    assets: [],
    entries: {
      server: "dist/server.js",
      ...(clientFile && { client: clientFile }),
    },
    capabilities: deriveCapabilities(buildRoutes),
  };
}

async function measureDiscover(
  projectDir: string,
  count: number,
  runs: number,
): Promise<number> {
  const routesDir = await makeFixture(projectDir, count);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await discoverRoutes({ routesDir });
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  return median(times);
}

async function measureClassify(
  projectDir: string,
  count: number,
  runs: number,
): Promise<number> {
  const routesDir = await makeFixture(projectDir, count);
  const raw = await discoverRoutes({ routesDir });
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    for (const route of raw) {
      const facts = analyzeModule(route.file);
      classifyRoute({ explicit: route.mode, facts });
    }
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  return median(times);
}

async function measureManifest(
  projectDir: string,
  count: number,
  runs: number,
): Promise<number> {
  await makeFixture(projectDir, count);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await generateManifest(projectDir, count, "bun");
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  return median(times);
}

async function measureColdBuild(
  root: string,
  count: number,
  runs: number,
): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const dir = await mkdtemp(resolve(root, ".bench-"));
    await makeFixture(dir, count);
    const t0 = performance.now();
    await buildProject({ projectDir: dir });
    const t1 = performance.now();
    times.push(t1 - t0);
    await rm(dir, { recursive: true, force: true });
  }
  return median(times);
}

async function measureIncrementalBuild(
  root: string,
  count: number,
  runs: number,
): Promise<number> {
  const dir = await mkdtemp(resolve(root, ".bench-"));
  await makeFixture(dir, count);
  await buildProject({ projectDir: dir });
  const times: number[] = [];
  const indexFile = resolve(dir, "src", "routes", "index.tsx");
  for (let i = 0; i < runs; i++) {
    const source = `export function loader() { return { ok: true, i: ${i} }; }\nexport default function Page() { return <h1>Page ${i}</h1>; }\n`;
    await writeFile(indexFile, source);
    const t0 = performance.now();
    await buildProject({ projectDir: dir });
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  await rm(dir, { recursive: true, force: true });
  return median(times);
}

const renderer: Renderer = {
  name: "noop",
  async render() {
    return new Response("ok");
  },
  async prerender() {
    return "ok";
  },
};

async function measureServer(
  root: string,
  count: number,
  runs: number,
): Promise<{ startup: number; staticRequest: number; ssrRequest: number }> {
  const dir = await mkdtemp(resolve(root, ".bench-"));
  await makeFixture(dir, count);
  const manifest = await buildProject({ projectDir: dir });

  const modules: Record<
    string,
    { loader: (ctx: { params: Record<string, string> }) => unknown }
  > = {};
  for (const route of manifest.routes) {
    modules[route.id] = {
      loader: (ctx) => ({ ok: true, path: ctx.params }),
    };
  }

  const publicDir = resolve(dir, "public");
  await mkdir(publicDir, { recursive: true });
  await writeFile(resolve(publicDir, "ok.txt"), "ok");

  const fetch = createRequestHandler({
    manifest,
    modules,
    renderer,
    staticDir: publicDir,
    notFound: () => new Response("Not Found", { status: 404 }),
  });

  const startupTimes: number[] = [];
  const servers: ReturnType<typeof createBunServer>[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const server = createBunServer({
      fetch,
      port: 0,
      staticDir: publicDir,
    });
    const t1 = performance.now();
    startupTimes.push(t1 - t0);
    servers.push(server);
  }
  for (const server of servers) {
    server.stop(true);
  }

  const server = createBunServer({
    fetch,
    port: 0,
    staticDir: publicDir,
  });
  const url = server.url;

  const staticTimes: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = await fetchRequest(new URL("/ok.txt", url).href);
    if (res.status !== 200) {
      throw new Error(`static request failed: ${res.status}`);
    }
    const t1 = performance.now();
    staticTimes.push(t1 - t0);
  }

  const ssrPath = count === 1 ? "/" : `/page${count - 1}`;
  const ssrTimes: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = await fetchRequest(new URL(ssrPath, url).href);
    if (res.status !== 200) {
      throw new Error(`ssr request failed: ${res.status}`);
    }
    const t1 = performance.now();
    ssrTimes.push(t1 - t0);
  }

  server.stop(true);
  await rm(dir, { recursive: true, force: true });

  return {
    startup: median(startupTimes),
    staticRequest: median(staticTimes),
    ssrRequest: median(ssrTimes),
  };
}

async function fetchRequest(url: string): Promise<Response> {
  return fetch(new Request(url));
}

async function runBenchmark(options: {
  counts: number[];
  runs: number;
  out: string;
}): Promise<void> {
  const base = resolve(import.meta.dir, "..");
  const scratch = resolve(base, "tmp-benchmark");
  await mkdir(scratch, { recursive: true });

  const rows: BenchmarkRow[] = [];
  for (const count of options.counts) {
    const root = await mkdtemp(resolve(scratch, `bench-${count}-`));
    const discover = await measureDiscover(root, count, options.runs);
    const classify = await measureClassify(root, count, options.runs);
    const manifest = await measureManifest(root, count, options.runs);
    const coldBuild = await measureColdBuild(root, count, options.runs);
    const incrementalBuild = await measureIncrementalBuild(
      root,
      count,
      options.runs,
    );
    const { startup, staticRequest, ssrRequest } = await measureServer(
      root,
      count,
      options.runs,
    );
    rows.push({
      routes: count,
      discover,
      classify,
      manifest,
      coldBuild,
      incrementalBuild,
      serverStartup: startup,
      staticRequest,
      ssrRequest,
    });
    await rm(root, { recursive: true, force: true });
  }

  await rm(scratch, { recursive: true, force: true });
  await mkdir(dirname(options.out), { recursive: true });

  const report = formatReport(rows, options);
  await writeFile(options.out, report);
  console.log(`Benchmark results written to ${options.out}`);
}

function formatReport(
  rows: BenchmarkRow[],
  options: { counts: number[]; runs: number },
): string {
  const env = [
    `bun: ${process.versions.bun ?? "unknown"}`,
    `os: ${process.platform} ${process.arch}`,
    `runs per measurement: ${options.runs}`,
    `counts: ${options.counts.join(", ")}`,
  ];
  const header =
    "| routes | discovery (ms) | classification (ms) | manifest (ms) | cold build (ms) | incremental build (ms) | server startup (ms) | static request (ms) | SSR request (ms) |";
  const separator =
    "|-------:|---------------:|--------------------:|--------------:|----------------:|-----------------------:|--------------------:|--------------------:|-----------------:|";
  const lines = [header, separator];
  for (const row of rows) {
    lines.push(
      `| ${row.routes} | ${row.discover.toFixed(2)} | ${row.classify.toFixed(
        2,
      )} | ${row.manifest.toFixed(2)} | ${row.coldBuild.toFixed(2)} | ${row.incrementalBuild.toFixed(
        2,
      )} | ${row.serverStartup.toFixed(2)} | ${row.staticRequest.toFixed(
        2,
      )} | ${row.ssrRequest.toFixed(2)} |`,
    );
  }
  return `${env.map((line) => `- ${line}`).join("\n")}\n\n${lines.join(
    "\n",
  )}\n`;
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    counts: { type: "string" },
    runs: { type: "string" },
    out: { type: "string" },
  },
  strict: false,
});

const counts = values.counts
  ? values.counts.split(",").map((n) => parseInt(n, 10))
  : [10, 100, 1000];
const runs = values.runs ? parseInt(values.runs as string, 10) : 10;
const out = values.out
  ? (values.out as string)
  : resolve(import.meta.dir, "..", "docs/audits/benchmark-results.md");

await runBenchmark({ counts, runs, out });
