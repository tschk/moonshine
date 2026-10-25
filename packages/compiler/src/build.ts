import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  PUBLIC_DIR,
  type RouteArtifact,
  type RendererName,
} from "@tschk/moonshine-framework";
import { canonicalPath, toPosix } from "./path.js";

export type BundleAsset = {
  file: string;
  path: string;
  integrity: string;
};

export type PublicAsset = { source: string; relative: string };

function overlaps(left: string, right: string): boolean {
  return [relative(left, right), relative(right, left)].some(
    (path) =>
      path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path),
  );
}

/** Run before clearing output: public inputs must remain separate and never follow symlinks. */
export async function preparePublicAssets(
  root: string,
  outDir: string,
): Promise<PublicAsset[]> {
  const source = resolve(root, "public");
  const [canonicalSource, canonicalOutput] = await Promise.all([
    canonicalPath(source),
    canonicalPath(resolve(outDir)),
  ]);
  if (overlaps(canonicalSource, canonicalOutput))
    throw new Error("Public asset source and build output must not overlap");
  let entry;
  try {
    entry = await lstat(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (entry.isSymbolicLink() || !entry.isDirectory())
    throw new Error(
      "Public asset root must be a real directory, not a symlink",
    );
  const assets: PublicAsset[] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = (
      await readdir(directory, { withFileTypes: true })
    ).toSorted((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const path = join(directory, child.name);
      if (child.isSymbolicLink())
        throw new Error(`Public asset symlinks are unsupported: ${path}`);
      if (child.isDirectory()) await visit(path);
      else if (child.isFile())
        assets.push({
          source: path,
          relative: sourcePath(relative(source, path)),
        });
      else throw new Error(`Public assets must be regular files: ${path}`);
    }
  };
  await visit(source);
  return assets;
}

type BuiltFile = {
  path: string;
  kind: string;
  cssBundle?: string;
  entryPoint?: string;
};
type InputGraph = Map<
  string,
  {
    format?: string;
    imports: Array<{ path: string; external?: boolean }>;
  }
>;
type BuiltResult = { files: BuiltFile[]; inputs: InputGraph };

export type BundleOutput = {
  server: BundleAsset[];
  client: BundleAsset[];
  routeClientEntries: Record<string, string>;
  routeClientStyles: Record<string, string[]>;
  entryFiles: {
    server: string;
    client?: string;
  };
};

function sourcePath(path: string): string {
  return sep === "\\" ? toPosix(path) : path;
}

function importPath(from: string, to: string): string {
  const rel = sourcePath(relative(from, to));
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function generateServerEntry(
  buildDir: string,
  routes: RouteArtifact[],
  native: boolean,
  root: string,
  requestContext: boolean,
): string {
  const keysForFile = (file: string) => {
    const rel = sourcePath(relative(root, file));
    return rel.startsWith("..") ? [sourcePath(file)] : [sourcePath(file), rel];
  };
  const imports: string[] = native
    ? [
        `import { createNativeRenderer } from "@tschk/moonshine-dom/framework-native";`,
      ]
    : [];
  if (requestContext) {
    imports.push(
      `export { runWithRequest as requestScope } from "@tschk/moonshine-framework/request";`,
    );
  }
  const bodies: string[] = [];
  const moduleHelpers: string[] = [];
  const moduleBodys: string[] = [];
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const modulePath = importPath(buildDir, route.file);
    imports.push(`import * as route_${i} from ${JSON.stringify(modulePath)};`);
    if (route.dataFile) {
      const dataPath = importPath(buildDir, route.dataFile);
      imports.push(`import * as data_${i} from ${JSON.stringify(dataPath)};`);
    }
    const dataRef = route.dataFile ? `data_${i}` : "undefined";
    bodies.push(
      `  [${JSON.stringify(route.path)}]: { module: route_${i}, data: ${dataRef} }`,
    );
    moduleHelpers.push(`function makeModule_${i}(mod, data) {
  const m = { ...mod, ...data };
  const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
  const handlers = Object.fromEntries(methods.filter(method => typeof m[method] === "function").map(method => [method, m[method]]));
  const fallback = typeof m.handler === "function" ? m.handler : undefined;
  if (Object.keys(handlers).length || fallback) {
    const allowed = new Set(Object.keys(handlers));
    if (m.loader || handlers.GET) { allowed.add("GET"); allowed.add("HEAD"); }
    if (m.action) for (const method of ["POST", "PUT", "PATCH", "DELETE"]) allowed.add(method);
    const supported = methods.filter(method => allowed.has(method));
    if (!fallback) m.methods = supported;
    const allow = supported.join(", ");
    const dispatch = (ctx) => {
      const method = ctx.request.method;
      const handler = (Object.hasOwn(handlers, method) ? handlers[method] : undefined) || (method === "HEAD" ? handlers.GET : undefined) || fallback;
      return handler ? handler(ctx.request) : new Response(null, { status: 405, headers: { allow } });
    };
    if (!m.loader && (handlers.GET || handlers.HEAD || fallback)) m.loader = (ctx) => ctx.request.method === "GET" || ctx.request.method === "HEAD" ? dispatch(ctx) : undefined;
    if (!m.action && (fallback || methods.some(method => method !== "GET" && method !== "HEAD" && handlers[method]))) m.action = dispatch;
  }
  return m;
}`);
    const moduleVar = `module_${i}`;
    const keys = new Set([
      route.id,
      ...keysForFile(route.file),
      ...(route.dataFile ? keysForFile(route.dataFile) : []),
    ]);
    moduleBodys.push(
      ...Array.from(keys, (key) => `  [${JSON.stringify(key)}]: ${moduleVar}`),
    );
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
      `import * as support_${i} from ${JSON.stringify(importPath(buildDir, file))};`,
    );
    // Registered unwrapped: these export a component or middleware, not a route
    // module with loader/action semantics.
    moduleBodys.push(
      ...keysForFile(file).map(
        (key) => `  [${JSON.stringify(key)}]: support_${i}`,
      ),
    );
  }

  return `${imports.join("\n")}\n\n${moduleHelpers.join("\n")}\n\nconst ${routes.map((_, i) => `module_${i} = makeModule_${i}(route_${i}, ${routes[i]!.dataFile ? `data_${i}` : "undefined"})`).join(";\nconst ")};\n\nexport const routes = {\n${bodies.join(",\n")}\n};\n\nexport const modules = {\n${moduleBodys.join(",\n")}\n};\n${native ? `export const renderer = createNativeRenderer(modules, Object.fromEntries(${JSON.stringify(routes.map((route) => [route.id, route.layouts ?? []]))}));\n` : ""}`;
}

function generateClientEntry(
  buildDir: string,
  routes: RouteArtifact[],
  native: boolean,
): string | undefined {
  const clientRoutes = routes.filter(
    (r) => r.mode === "island" || r.mode === "spa",
  );
  if (clientRoutes.length === 0) return undefined;
  if (native) {
    const imports = [`import { h, render } from "@tschk/moonshine-dom/dom";`];
    const pages: string[] = [];
    for (const [index, route] of clientRoutes.entries()) {
      if (!route.clientFile)
        throw new Error(`Native SPA route "${route.path}" requires clientFile`);
      imports.push(
        `import page_${index} from ${JSON.stringify(importPath(buildDir, route.clientFile))};`,
      );
      pages.push(`[${JSON.stringify(route.id)}]: page_${index}`);
    }
    return `${imports.join("\n")}
const pages = {${pages.join(",")}};
const root = document.querySelector("[data-moonshine-app]");
if (root) {
  const id = root.getAttribute("data-moonshine-app");
  const page = Object.hasOwn(pages, id) ? pages[id] : undefined;
  if (!page) throw new Error("Native page entry was not bundled");
  const payload = document.querySelector('script[type="application/json"][data-moonshine-props]');
  const props = payload ? JSON.parse(payload.textContent || "{}") : {};
  const dispose = render(() => h(page, props), root);
  window.addEventListener("pagehide", (event) => { if (!event.persisted) dispose(); });
}
`;
  }
  const imports: string[] = [];
  const body: string[] = [];
  let index = 0;
  for (const route of clientRoutes) {
    const modulePath = importPath(buildDir, route.file);
    imports.push(`import route_${index} from ${JSON.stringify(modulePath)};`);
    body.push(`  [${JSON.stringify(route.path)}]: route_${index}`);
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

// Bun.build is not safe to overlap in one process: concurrent calls race
// module resolution and fail with "Unexpected reading file" on shared
// dependencies (seen on macOS CI when compiler tests run in parallel).
let bunBuildQueue: Promise<unknown> = Promise.resolve();

function enqueueBunBuild<T>(work: () => Promise<T>): Promise<T> {
  const run = bunBuildQueue.then(work, work);
  bunBuildQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runBuild(
  entries: string[],
  outdir: string,
  root: string,
  target: "bun" | "node" | "browser",
  options: {
    serverFiles?: Set<string>;
    splitting?: boolean;
    metadata?: boolean;
    minify?: boolean;
  } = {},
): Promise<BuiltResult> {
  const result = await enqueueBunBuild(() =>
    Bun.build({
      entrypoints: entries,
      outdir,
      root,
      target,
      format: "esm",
      naming: "[name].[ext]",
      splitting: options.splitting ?? false,
      sourcemap: "none",
      metafile: options.metadata || options.splitting,
      minify: options.minify ?? false,
      ...(options.serverFiles && {
        plugins: [
          {
            name: "native-client-boundary",
            setup(build) {
              build.onLoad({ filter: /.*/ }, (args) => {
                if (options.serverFiles!.has(resolve(args.path))) {
                  throw new Error(
                    `Native client imports server-only route module: ${args.path}`,
                  );
                }
              });
            },
          },
        ],
      }),
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
    }),
  );
  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Bun build failed for ${target}: ${messages}`);
  }
  const metadata = new Map(
    Object.entries(result.metafile?.outputs ?? {}).map(([name, details]) => [
      resolve(outdir, name),
      details,
    ]),
  );
  return {
    inputs: new Map(
      Object.entries(result.metafile?.inputs ?? {}).map(([file, input]) => [
        resolve(file),
        input,
      ]),
    ),
    files: result.outputs
      .filter((output) => output.kind !== "sourcemap")
      .map(({ path, kind }) => {
        const details = metadata.get(resolve(path));
        return {
          path,
          kind,
          ...(details?.cssBundle && {
            cssBundle: resolve(outdir, details.cssBundle),
          }),
          ...(details?.entryPoint && {
            entryPoint: resolve(details.entryPoint),
          }),
        };
      }),
  };
}

function toOutRelative(outDir: string, outputPath: string): string {
  return sourcePath(relative(outDir, outputPath));
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

function findEntry(
  entry: string,
  directory: string,
  outputs: BuiltFile[],
): BuiltFile {
  const expected = resolve(directory, `${basename(entry, extname(entry))}.js`);
  const output = outputs.find(
    (artifact) =>
      artifact.kind === "entry-point" && resolve(artifact.path) === expected,
  );
  if (!output) throw new Error(`Missing bundle entry output for ${entry}`);
  return output;
}

async function cssRoots(graph: InputGraph, files: string[]): Promise<string[]> {
  const visited = new Set<string>();
  const css: string[] = [];
  const visit = async (file: string) => {
    file = resolve(file);
    if (visited.has(file)) return;
    visited.add(file);
    const input = graph.get(file);
    if (!input) return;
    if (input.format === "css") {
      css.push(file);
      return;
    }
    // Dynamic imports contribute CSS eagerly until the native loader supports lazy styles.
    for (const edge of input.imports) {
      if (edge.external) continue;
      let target = edge.path;
      // Bun may leave duplicate import edges as their original relative specifier.
      if (
        !isAbsolute(target) &&
        !graph.has(resolve(target)) &&
        (target.startsWith("./") || target.startsWith("../"))
      ) {
        target = await realpath(Bun.resolveSync(target, dirname(file)));
        if (!graph.has(target)) {
          throw new Error(
            `Missing CSS dependency graph input for ${edge.path} imported by ${file}`,
          );
        }
      }
      await visit(target);
    }
  };
  for (const file of files) await visit(await realpath(file));
  return css;
}

function cssImport(file: string): string {
  const escaped = file.replace(
    /["\\\n\r\f]/g,
    (character) => `\\${character.charCodeAt(0).toString(16)} `,
  );
  return `@import "${escaped}";`;
}

export async function buildBundles(options: {
  root: string;
  outDir: string;
  routes: RouteArtifact[];
  renderer?: RendererName;
  requestContext?: boolean;
  publicAssets?: readonly PublicAsset[];
}): Promise<BundleOutput> {
  const publicAssets =
    options.publicAssets ??
    (await preparePublicAssets(options.root, options.outDir));
  const buildDir = resolve(options.outDir, ".build");
  await mkdir(buildDir, { recursive: true });

  const serverEntry = join(buildDir, "server.ts");
  await writeFile(
    serverEntry,
    generateServerEntry(
      buildDir,
      options.routes,
      options.renderer === "native",
      options.root,
      options.requestContext === true,
    ),
  );

  const clientEntries: string[] = [];
  const routeEntries = new Map<string, string>();
  const native = options.renderer === "native";
  const clientGroups = native
    ? options.routes
        .filter((route) => route.mode === "spa")
        .map((route) => [route])
    : [options.routes];
  for (const [index, routes] of clientGroups.entries()) {
    const code = generateClientEntry(buildDir, routes, native);
    if (!code) continue;
    const entry = join(
      buildDir,
      index === 0 ? "client.ts" : `client-${index}.ts`,
    );
    await writeFile(entry, code);
    clientEntries.push(entry);
    if (native) routeEntries.set(routes[0]!.id, entry);
  }

  const distDir = resolve(options.outDir, "dist");
  await mkdir(distDir, { recursive: true });

  // Client output goes in its own directory because that directory is what the
  // server exposes over HTTP; the server bundle must never sit inside it.
  const publicDir = resolve(options.outDir, PUBLIC_DIR);
  await mkdir(publicDir, { recursive: true });

  const serverBuild = await runBuild(
    [serverEntry],
    distDir,
    options.root,
    native &&
      options.routes.some((route) =>
        ["node", "cloudflare"].includes(route.runtime),
      )
      ? "node"
      : "bun",
    { metadata: native },
  );
  const serverFiles = native
    ? new Set(
        await Promise.all(
          options.routes
            .flatMap((route) => [
              route.file,
              route.dataFile,
              route.errorBoundary,
              ...(route.layouts ?? []),
              ...(route.middleware ?? []),
            ])
            .filter((file): file is string => Boolean(file))
            .map((file) => realpath(file)),
        ),
      )
    : undefined;
  const clientBuild = clientEntries.length
    ? await runBuild(clientEntries, publicDir, options.root, "browser", {
        serverFiles,
        splitting: native,
      })
    : { files: [], inputs: new Map() };
  const serverOutputs = serverBuild.files;
  const clientOutputs = clientBuild.files;
  const serverStyleEntries = new Map<string, string>();
  if (native) {
    for (const [index, route] of options.routes.entries()) {
      if (route.mode === "api") continue;
      const serverCss = await cssRoots(
        serverBuild.inputs,
        [
          ...(route.layouts ?? []),
          ...(route.middleware ?? []),
          route.dataFile,
          route.file,
          route.errorBoundary,
        ].filter((file): file is string => Boolean(file)),
      );
      if (!serverCss.length) continue;
      const browserCss = route.clientFile
        ? await cssRoots(clientBuild.inputs, [route.clientFile])
        : [];
      const entry = join(buildDir, `server-style-${index}.css`);
      await writeFile(
        entry,
        [...new Set([...serverCss, ...browserCss])].map(cssImport).join("\n"),
      );
      serverStyleEntries.set(route.id, entry);
    }
  }
  const cssBuild = serverStyleEntries.size
    ? await runBuild(
        [...serverStyleEntries.values()],
        publicDir,
        options.root,
        "browser",
        { metadata: true, minify: true },
      )
    : { files: [], inputs: new Map() };

  const serverAssets = await buildBundleAssets(
    options.outDir,
    serverOutputs.map((output) => output.path),
  );
  const clientAssets = await buildBundleAssets(
    options.outDir,
    [...clientOutputs, ...cssBuild.files].map((output) => output.path),
    publicDir,
  );

  const publicPaths = publicAssets.map((asset) => ({
    ...asset,
    destination: resolve(publicDir, asset.relative),
    url: "/" + asset.relative.split("/").map(encodeURIComponent).join("/"),
  }));
  const generatedPaths = [
    ...serverOutputs,
    ...clientOutputs,
    ...cssBuild.files,
  ].map((output) => resolve(output.path));
  const urls = new Set(
    [...serverAssets, ...clientAssets].map((asset) => asset.path),
  );
  // Check every file before copying any public input, including file/directory conflicts.
  for (const asset of publicPaths) {
    if (
      !asset.destination.startsWith(publicDir + sep) ||
      generatedPaths.some((path) => overlaps(path, asset.destination))
    )
      throw new Error(
        `Public asset collides with generated output: ${asset.relative}`,
      );
    if (urls.has(asset.url))
      throw new Error(
        `Public asset URL collides with generated output: ${asset.url}`,
      );
    urls.add(asset.url);
    let ancestor = asset.destination;
    while (ancestor !== publicDir) {
      try {
        const entry = await lstat(ancestor);
        if (
          ancestor === asset.destination ||
          !entry.isDirectory() ||
          entry.isSymbolicLink()
        )
          throw new Error(
            `Public asset destination already exists: ${asset.relative}`,
          );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      ancestor = dirname(ancestor);
    }
  }
  const copiedAssets = await Promise.all(
    publicPaths.map(async (asset) => {
      await mkdir(dirname(asset.destination), { recursive: true });
      await copyFile(asset.source, asset.destination);
      return {
        file: toOutRelative(options.outDir, asset.destination),
        path: asset.url,
        integrity: await hashFile(asset.destination),
      };
    }),
  );
  clientAssets.push(...copiedAssets);

  const routeClientEntries = Object.fromEntries(
    Array.from(routeEntries, ([id, entry]) => [
      id,
      `/${toOutRelative(publicDir, findEntry(entry, publicDir, clientOutputs).path)}`,
    ]),
  );

  const routeClientStyles: Record<string, string[]> = Object.create(null);
  for (const [id, entry] of routeEntries) {
    const { cssBundle } = findEntry(entry, publicDir, clientOutputs);
    routeClientStyles[id] = cssBundle
      ? [`/${toOutRelative(publicDir, cssBundle)}`]
      : [];
  }

  for (const [id, entry] of serverStyleEntries) {
    const source = await realpath(entry);
    const output = cssBuild.files.find(
      (file) => file.entryPoint === source && file.path.endsWith(".css"),
    );
    if (!output)
      throw new Error(
        `Missing CSS bundle output for ${entry} (resolved ${source}); returned outputs: ${JSON.stringify(cssBuild.files.map(({ path, entryPoint }) => ({ path, entryPoint })))}`,
      );
    routeClientStyles[id] = [`/${toOutRelative(publicDir, output.path)}`];
  }

  return {
    server: serverAssets,
    client: clientAssets,
    routeClientEntries,
    routeClientStyles,
    entryFiles: {
      server: toOutRelative(
        options.outDir,
        findEntry(serverEntry, distDir, serverOutputs).path,
      ),
      client: clientEntries.length
        ? `/${toOutRelative(publicDir, findEntry(clientEntries[0]!, publicDir, clientOutputs).path)}`
        : undefined,
    },
  };
}
