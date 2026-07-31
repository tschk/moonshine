import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { RouteArtifact } from "@tschk/moonshine-framework";

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

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function importPath(from: string, to: string): string {
  const rel = toPosix(relative(from, to));
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function generateServerEntry(
  buildDir: string,
  routes: RouteArtifact[],
): string {
  const imports: string[] = [];
  const body: string[] = [];
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const modulePath = importPath(buildDir, route.file);
    imports.push(`import * as route_${i} from "${modulePath}";`);
    if (route.dataFile) {
      const dataPath = importPath(buildDir, route.dataFile);
      imports.push(`import * as data_${i} from "${dataPath}";`);
    }
    const dataRef = route.dataFile ? `data_${i}` : "undefined";
    body.push(`  "${route.path}": { module: route_${i}, data: ${dataRef} }`);
  }
  return `${imports.join("\n")}\n\nexport const routes = {\n${body.join(",\n")}\n};\n`;
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
): Promise<BundleAsset[]> {
  const assets: BundleAsset[] = [];
  for (const outputPath of outputPaths) {
    const file = toOutRelative(outDir, outputPath);
    assets.push({
      file,
      path: `/${file}`,
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

  const serverOutputs = await runBuild(
    serverEntry,
    distDir,
    options.root,
    "bun",
  );
  const clientOutputs = clientEntry
    ? await runBuild(clientEntry, distDir, options.root, "browser")
    : [];

  const serverAssets = await buildBundleAssets(options.outDir, serverOutputs);
  const clientAssets = await buildBundleAssets(options.outDir, clientOutputs);

  return {
    server: serverAssets,
    client: clientAssets,
    entryFiles: {
      server: serverAssets[0]?.file ?? "",
      client: clientAssets[0]?.file,
    },
  };
}
