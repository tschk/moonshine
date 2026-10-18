import { normalizeRouteDataRequests } from "@tschk/moonshine-framework/data-request";
import type { RouteDataRequests } from "@tschk/moonshine-framework/data-request";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type {
  MoonshineManifest,
  RouteArtifact,
  RouteDefinition,
  RuntimeTarget,
  RenderMode,
  RendererName,
} from "@tschk/moonshine-framework";
import { MANIFEST_VERSION } from "@tschk/moonshine-framework";
import { analyzeModule } from "./analyze.js";
import { buildBundles, preparePublicAssets } from "./build.js";
import { classifyRoute } from "./classify.js";
import { discoverRoutes } from "./discover.js";
import type { RouteConvention } from "./inherit.js";
import { canonicalPath, toPosix } from "./path.js";

export type BuildOptions = {
  projectDir: string;
  routesDir?: string;
  outDir?: string;
  programmatic?: RouteDefinition[];
  runtime?: RuntimeTarget;
  convention?: RouteConvention;
  renderer?: RendererName;
  requestContext?: boolean;
  /** Enable the opt-in JSON route-data request protocol. */
  dataRequests?: RouteDataRequests;
  mode?: RenderMode;
};

function toProjectRelative(projectDir: string, p: string): string {
  const normalize = (path: string) => (sep === "\\" ? toPosix(path) : path);
  const rel = normalize(relative(projectDir, resolve(p)));
  return rel.startsWith("..") ? normalize(p) : rel || ".";
}

function contains(directory: string, path: string): boolean {
  const rel = relative(directory, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep);
}

async function validateOutput(
  projectDir: string,
  routesDir: string,
  outDir: string,
  routes: RouteArtifact[],
): Promise<void> {
  const [project, sourceRoutes, output] = await Promise.all(
    [projectDir, routesDir, outDir].map(canonicalPath),
  );
  if (contains(output!, project!))
    throw new Error("Build output must not contain the project directory");
  if (contains(output!, sourceRoutes!) || contains(sourceRoutes!, output!))
    throw new Error("Build output and route source directory must not overlap");
  const files = new Set(
    routes
      .flatMap((route) => [
        route.file,
        route.clientFile,
        route.dataFile,
        route.errorBoundary,
        ...(route.layouts ?? []),
        ...(route.middleware ?? []),
      ])
      .filter((file): file is string => Boolean(file)),
  );
  for (const file of files) {
    const [target, parent] = await Promise.all([
      canonicalPath(file),
      canonicalPath(dirname(file)),
    ]);
    if (
      contains(outDir, file) ||
      contains(output!, target) ||
      contains(output!, join(parent, basename(file)))
    )
      throw new Error(`Build output must not contain source file: ${file}`);
  }
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
  native: boolean,
): MoonshineManifest["capabilities"] {
  const capabilities: Set<MoonshineManifest["capabilities"][number]> =
    new Set();
  if (!native) capabilities.add("streaming");
  for (const route of routes) {
    if (route.mode === "island" || (!native && route.mode === "spa")) {
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
  // Parameterized paths (`:slug`, `:tab?`, `*rest`) cannot be prerendered as
  // a single file; a slug like `blog-:slug.html` would be served for every
  // match.
  if (route.path.includes("*") || route.path.includes(":")) return undefined;
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
  const dataRequests = normalizeRouteDataRequests(options.dataRequests);
  if (options.requestContext && !["bun", "node"].includes(runtime)) {
    throw new Error(
      "Request context currently supports only Bun and Node runtimes",
    );
  }

  if (dataRequests && !["bun", "node"].includes(runtime)) {
    throw new Error(
      "Route data requests currently support only Bun and Node runtimes",
    );
  }

  const rawRoutes = await discoverRoutes({
    routesDir,
    programmatic: options.programmatic?.map((route) => ({
      ...route,
      file: resolve(projectDir, route.file),
      ...(route.clientFile && {
        clientFile: resolve(projectDir, route.clientFile),
      }),
      ...(route.dataFile && { dataFile: resolve(projectDir, route.dataFile) }),
      ...(route.layouts && {
        layouts: route.layouts.map((file) => resolve(projectDir, file)),
      }),
      ...(route.middleware && {
        middleware: route.middleware.map((file) => resolve(projectDir, file)),
      }),
      ...(route.errorBoundary && {
        errorBoundary: resolve(projectDir, route.errorBoundary),
      }),
    })),
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
    if (options.requestContext && (route.runtime ?? runtime) !== runtime) {
      throw new Error(
        "Request-context routes must match the configured server runtime",
      );
    }
    if (dataRequests && (route.runtime ?? runtime) !== runtime) {
      throw new Error(
        "Data-request routes must match the configured server runtime",
      );
    }
    const facts = analyzeModule(route.file, undefined, rawRouteTexts[i]);
    const decision = classifyRoute({
      explicit: route.mode ?? options.mode,
      facts,
    });
    if (options.renderer === "native") {
      if (!["bun", "node", "cloudflare"].includes(route.runtime ?? runtime)) {
        throw new Error(
          "Native renderer currently supports only the Bun, Node and Cloudflare runtimes",
        );
      }
      if (decision.mode === "island") {
        throw new Error(
          `Native route "${route.path}" cannot use island mode: hydration is not implemented`,
        );
      }
      if ((decision.mode === "spa" || facts.interactive) && !route.clientFile) {
        throw new Error(
          `Native interactive route "${route.path}" requires an explicit clientFile`,
        );
      }
      if (route.clientFile && decision.mode !== "spa") {
        throw new Error(
          `Native route "${route.path}" with clientFile must use spa mode`,
        );
      }
    }
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

  if (
    options.renderer === "native" &&
    new Set(buildRoutes.map((route) => route.runtime)).size > 1
  ) {
    throw new Error("Native routes must use one server runtime per build");
  }

  await validateOutput(projectDir, routesDir, outDir, buildRoutes);
  const publicAssets = await preparePublicAssets(projectDir, outDir);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const bundles = await buildBundles({
    root: projectDir,
    outDir,
    routes: buildRoutes,
    renderer: options.renderer,
    requestContext: options.requestContext,
    publicAssets,
  });
  const clientFile = bundles.entryFiles.client;

  for (const route of buildRoutes) {
    if ((route.mode === "island" || route.mode === "spa") && clientFile) {
      route.clientEntries = [
        options.renderer === "native"
          ? bundles.routeClientEntries[route.id]!
          : clientFile,
      ];
    }
    if (
      options.renderer === "native" &&
      Object.hasOwn(bundles.routeClientStyles, route.id) &&
      bundles.routeClientStyles[route.id]!.length
    ) {
      route.clientStyles = bundles.routeClientStyles[route.id];
    }
    route.serverEntry = bundles.entryFiles.server;
  }

  const allAssets = [...bundles.server, ...bundles.client].sort((a, b) =>
    a.file.localeCompare(b.file),
  );

  const manifest: MoonshineManifest = {
    version: MANIFEST_VERSION,
    frameworkVersion: await resolveFrameworkVersion(),
    ...(options.renderer && { renderer: options.renderer }),
    ...(options.requestContext && { requestContext: true }),
    ...(dataRequests && { dataRequests }),
    routes: buildRoutes.map((route) => ({
      ...route,
      file: toProjectRelative(projectDir, route.file),
      ...(route.clientFile && {
        clientFile: toProjectRelative(projectDir, route.clientFile),
      }),
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
    capabilities: deriveCapabilities(
      buildRoutes,
      options.renderer === "native",
    ),
  };

  await writeFile(join(outDir, "manifest.json"), sortedStringify(manifest));
  return manifest;
}

export async function readManifest(path: string): Promise<MoonshineManifest> {
  const text = await readFile(resolve(path), "utf8");
  return JSON.parse(text) as MoonshineManifest;
}
