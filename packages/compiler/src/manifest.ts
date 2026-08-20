import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  MoonshineManifest,
  RouteArtifact,
  RouteDefinition,
  RuntimeTarget,
} from "@tschk/moonshine-framework";
import { MANIFEST_VERSION } from "@tschk/moonshine-framework";
import { analyzeModule } from "./analyze.js";
import { buildBundles } from "./build.js";
import { classifyRoute } from "./classify.js";
import { discoverRoutes } from "./discover.js";
import type { RouteConvention } from "./inherit.js";
import { toPosix } from "./path.js";

export type BuildOptions = {
  projectDir: string;
  routesDir?: string;
  outDir?: string;
  programmatic?: RouteDefinition[];
  runtime?: RuntimeTarget;
  convention?: RouteConvention;
};

function toProjectRelative(projectDir: string, p: string): string {
  const rel = toPosix(relative(projectDir, resolve(p)));
  return rel.startsWith("..") ? toPosix(p) : rel || ".";
}

async function resolveFrameworkVersion(): Promise<string> {
  const url = import.meta.resolve("@tschk/moonshine-framework");
  const entryPath = new URL(url).pathname;
  const pkgPath = entryPath.split("/").slice(0, -2).join("/") + "/package.json";
  const pkg = (await Bun.file(pkgPath).json()) as { version: string };
  return pkg.version;
}

function sortedStringify(value: unknown): string {
  const text = JSON.stringify(
    value,
    (_key, v) => {
      if (v === undefined) return undefined;
      if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    },
    2,
  );
  return `${text}\n`;
}

function deriveCapabilities(
  routes: RouteArtifact[],
): MoonshineManifest["capabilities"] {
  const capabilities: Set<MoonshineManifest["capabilities"][number]> =
    new Set();
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

function makeStaticOutput(route: RouteArtifact): string | undefined {
  if (route.mode !== "static") return undefined;
  if (route.path.includes("*")) return undefined;
  const slug =
    route.path === "/"
      ? "index"
      : route.path.replace(/^\/+/, "").replace(/\//g, "-");
  return `static/${slug}.html`;
}

export async function buildProject(
  options: BuildOptions,
): Promise<MoonshineManifest> {
  const projectDir = resolve(options.projectDir);
  const routesDir = resolve(
    options.routesDir ?? join(projectDir, "src", "routes"),
  );
  const outDir = resolve(options.outDir ?? join(projectDir, ".moonshine"));
  const runtime = options.runtime ?? "bun";

  const rawRoutes = await discoverRoutes({
    routesDir,
    programmatic: options.programmatic,
    ...(options.convention && { convention: options.convention }),
  });

  const rawRouteTexts = await Promise.all(
    rawRoutes.map((route) =>
      readFile(route.file, "utf8").catch(() => undefined),
    ),
  );

  const buildRoutes: RouteArtifact[] = [];
  for (let i = 0; i < rawRoutes.length; i++) {
    const route = rawRoutes[i];
    const facts = analyzeModule(route.file, undefined, rawRouteTexts[i]);
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

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const bundles = await buildBundles({
    root: projectDir,
    outDir,
    routes: buildRoutes,
  });
  const clientFile = bundles.entryFiles.client;

  for (const route of buildRoutes) {
    if ((route.mode === "island" || route.mode === "spa") && clientFile) {
      route.clientEntries = [clientFile];
    }
    route.serverEntry = bundles.entryFiles.server;
  }

  const allAssets = [...bundles.server, ...bundles.client].sort((a, b) =>
    a.file.localeCompare(b.file),
  );

  const manifest: MoonshineManifest = {
    version: MANIFEST_VERSION,
    frameworkVersion: await resolveFrameworkVersion(),
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
    assets: allAssets,
    entries: {
      ...(bundles.entryFiles.server && { server: bundles.entryFiles.server }),
      ...(clientFile && { client: clientFile }),
    },
    capabilities: deriveCapabilities(buildRoutes),
  };

  await writeFile(join(outDir, "manifest.json"), sortedStringify(manifest));
  return manifest;
}

export async function readManifest(path: string): Promise<MoonshineManifest> {
  const text = await readFile(resolve(path), "utf8");
  return JSON.parse(text) as MoonshineManifest;
}
