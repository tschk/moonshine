import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { PUBLIC_DIR, type RouteArtifact } from "@tschk/moonshine-framework";
import { toPosix } from "./path.js";

export type BundleAsset = {
  file: string;
  path: string;
  integrity: string;
};

export type BundleOutput = {
  server: BundleAsset[];
  client: BundleAsset[];
  entryFiles: {
    server: string;
    client?: string;
  };
};

function importPath(from: string, to: string): string {
  const rel = toPosix(relative(from, to));
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function generateServerEntry(
  buildDir: string,
  routes: RouteArtifact[],
): string {
  const imports: string[] = [];
  const bodies: string[] = [];
  const moduleHelpers: string[] = [];
  const moduleBodys: string[] = [];
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const modulePath = importPath(buildDir, route.file);
    imports.push(`import * as route_${i} from "${modulePath}";`);
    if (route.dataFile) {
      const dataPath = importPath(buildDir, route.dataFile);
      imports.push(`import * as data_${i} from "${dataPath}";`);
    }
    const dataRef = route.dataFile ? `data_${i}` : "undefined";
    bodies.push(`  "${route.path}": { module: route_${i}, data: ${dataRef} }`);
    moduleHelpers.push(`function makeModule_${i}(mod, data) {
  const m = { ...mod, ...data };
  if (!m.loader && typeof mod.GET === "function") {
    m.loader = (ctx) => mod.GET(ctx.request);
  }
  if (!m.action && typeof mod.POST === "function") {
    m.action = (ctx) => mod.POST(ctx.request);
  }
  if (!m.loader && !m.action && typeof mod.handler === "function") {
    m.loader = (ctx) => mod.handler(ctx.request);
  }
  return m;
}`);
    const moduleVar = `module_${i}`;
    moduleBodys.push(`  "${route.id}": ${moduleVar},
  "${toPosix(route.file)}": ${moduleVar}${
    route.dataFile
      ? `,
  "${toPosix(route.dataFile)}": ${moduleVar}`
      : ""
  }`);
  }
  // Layouts, middleware, and error boundaries are route dependencies the server
  // renders through, so they belong in the bundle alongside the pages. Without
  // them the renderer falls back to `await import(file)` on their SOURCE paths,
  // which only resolves where the source tree sits next to the build output —
  // never in a deployed image, and never on a runtime that cannot resolve a
  // dynamic import at all. A page would render locally and 500 in production.
  const supportFiles: string[] = [];
  for (const route of routes) {
    for (const file of [
      ...(route.layouts ?? []),
      ...(route.middleware ?? []),
      ...(route.errorBoundary ? [route.errorBoundary] : []),
    ]) {
      if (file && !supportFiles.includes(file)) supportFiles.push(file);
    }
  }
  for (let i = 0; i < supportFiles.length; i++) {
    const file = supportFiles[i]!;
    imports.push(
      `import * as support_${i} from "${importPath(buildDir, file)}";`,
    );
    // Registered unwrapped: these export a component or middleware, not a route
    // module with loader/action semantics.
    moduleBodys.push(`  "${toPosix(file)}": support_${i}`);
  }

  return `${imports.join("\n")}\n\n${moduleHelpers.join("\n")}\n\nconst ${routes.map((_, i) => `module_${i} = makeModule_${i}(route_${i}, ${routes[i]!.dataFile ? `data_${i}` : "undefined"})`).join(";\nconst ")};\n\nexport const routes = {\n${bodies.join(",\n")}\n};\n\nexport const modules = {\n${moduleBodys.join(",\n")}\n};\n`;
}

function generateClientEntry(
  buildDir: string,
  routes: RouteArtifact[],
): string | undefined {
  const clientRoutes = routes.filter(
    (r) => r.mode === "island" || r.mode === "spa",
  );
  if (clientRoutes.length === 0) return undefined;
  const imports: string[] = [];
  const body: string[] = [];
  let index = 0;
  for (const route of clientRoutes) {
    const modulePath = importPath(buildDir, route.file);
    imports.push(`import route_${index} from "${modulePath}";`);
    body.push(`  "${route.path}": route_${index}`);
    index++;
  }
  return `${imports.join("\n")}\n\nexport const islands = {\n${body.join(",\n")}\n};\n`;
}

async function hashFile(path: string): Promise<string> {
  const file = Bun.file(path);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await file.bytes());
  return `sha256-${hasher.digest("base64")}`;
}

async function runBuild(
  entry: string,
  outdir: string,
  root: string,
  target: "bun" | "browser",
): Promise<string[]> {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    root,
    target,
    format: "esm",
    naming: "[name].js",
    splitting: false,
    sourcemap: "none",
    // Browsers have no `process`. Any dependency that reads `process.env.X` —
    // and most of them do, behind a `typeof` guard or not — otherwise throws
    // `ReferenceError: process is not defined` while the entry module is being
    // evaluated. That happens before any render, so the app silently mounts
    // nothing: no error boundary runs and the page is simply blank.
    //
    // `??=` so an app that injects real values ahead of this bundle keeps them;
    // this only guarantees the property exists. Values are deliberately not
    // inlined here — inlining the process environment into a browser bundle
    // would ship every secret the build host happens to hold.
    ...(target === "browser"
      ? { banner: "globalThis.process ??= { env: {} };" }
      : {}),
  });
  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Bun build failed for ${target}: ${messages}`);
  }
  return result.outputs
    .filter((output) => output.kind !== "sourcemap")
    .map((output) => output.path);
}

function toOutRelative(outDir: string, outputPath: string): string {
  return toPosix(relative(outDir, outputPath));
}

async function buildBundleAssets(
  outDir: string,
  outputPaths: string[],
  urlBase?: string,
): Promise<BundleAsset[]> {
  const assets: BundleAsset[] = [];
  for (const outputPath of outputPaths) {
    const file = toOutRelative(outDir, outputPath);
    assets.push({
      file,
      path: `/${toOutRelative(urlBase ?? outDir, outputPath)}`,
      integrity: await hashFile(outputPath),
    });
  }
  return assets;
}

export async function buildBundles(options: {
  root: string;
  outDir: string;
  routes: RouteArtifact[];
}): Promise<BundleOutput> {
  const buildDir = resolve(options.outDir, ".build");
  await mkdir(buildDir, { recursive: true });

  const serverEntry = join(buildDir, "server.ts");
  await writeFile(serverEntry, generateServerEntry(buildDir, options.routes));

  const clientCode = generateClientEntry(buildDir, options.routes);
  let clientEntry: string | undefined;
  if (clientCode) {
    clientEntry = join(buildDir, "client.ts");
    await writeFile(clientEntry, clientCode);
  }

  const distDir = resolve(options.outDir, "dist");
  await mkdir(distDir, { recursive: true });

  // Client output goes in its own directory because that directory is what the
  // server exposes over HTTP; the server bundle must never sit inside it.
  const publicDir = resolve(options.outDir, PUBLIC_DIR);
  await mkdir(publicDir, { recursive: true });

  const serverOutputs = await runBuild(
    serverEntry,
    distDir,
    options.root,
    "bun",
  );
  const clientOutputs = clientEntry
    ? await runBuild(clientEntry, publicDir, options.root, "browser")
    : [];

  const serverAssets = await buildBundleAssets(options.outDir, serverOutputs);
  const clientAssets = await buildBundleAssets(
    options.outDir,
    clientOutputs,
    publicDir,
  );

  return {
    server: serverAssets,
    client: clientAssets,
    entryFiles: {
      server: serverAssets[0]?.file ?? "",
      client: clientAssets[0]?.path,
    },
  };
}
