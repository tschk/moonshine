import { lstat, readFile, realpath } from "node:fs/promises";
import { join, posix, resolve } from "node:path";

export type CrepusGraphTarget = "moonshine-dom" | "moonshine-ssr";
export type CrepusGraph = {
  entry: string;
  files: Array<{ path: string; source: string }>;
};
const extensions = [".ts", ".tsx", ".js", ".jsx"];
const componentExtensions = [".svelte", ".vue"];
export function validateNativeRuntimeImport(specifier: string): void {
  if (
    /^(?:(?:react|react-dom|solid-js|svelte|vue)(?:\/|$)|@vue\/(?:reactivity|runtime-core|runtime-dom|shared|server-renderer)(?:\/|$))/.test(
      specifier,
    )
  )
    throw new Error(
      `Unsupported native runtime import ${JSON.stringify(specifier)}; Crepus must lower host primitives to Moonshine or reject them`,
    );
}
function fail(message: string): never {
  throw new Error(`Invalid Crepus module graph: ${message}`);
}
function relativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !value.includes(String.fromCharCode(0)) &&
    !/^(?:\/|[a-z]:|file:)/i.test(value) &&
    value
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..")
  );
}
async function regularFile(directory: string, path: string): Promise<string> {
  const absolute = resolve(directory, path);
  let current = resolve(directory);
  const directoryStat = await lstat(current);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())
    fail("graph directory must be a real directory");
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) fail(`symlink: ${path}`);
    if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())
      fail(`not a regular file: ${path}`);
  }
  return readFile(absolute, "utf8");
}

/** Read only the explicitly inventoried, target-specific compiler module graph. */
export async function readCrepusGraph(
  directory: string,
  target: CrepusGraphTarget,
): Promise<CrepusGraph | undefined> {
  const manifestPath = "crepus-module-manifest.json";
  try {
    await lstat(join(directory, manifestPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const manifest = JSON.parse(await regularFile(directory, manifestPath));
  const entry = `CrepusEmit.${target}.ts`;
  const prefix = `modules/${target}/`;
  if (
    !manifest ||
    manifest.version !== 1 ||
    manifest.target !== target ||
    manifest.entry !== entry ||
    !relativePath(manifest.sourceEntry) ||
    ![...extensions, ...componentExtensions].includes(
      posix.extname(manifest.sourceEntry).toLowerCase(),
    ) ||
    !Array.isArray(manifest.files)
  )
    fail("unsupported manifest schema, version, target or entry");
  const paths = new Set<string>();
  for (const path of manifest.files) {
    if (
      !relativePath(path) ||
      (path !== entry && !path.startsWith(prefix)) ||
      !extensions.includes(posix.extname(path).toLowerCase())
    )
      fail(`unsupported file path: ${String(path)}`);
    if (paths.has(path)) fail(`duplicate file: ${path}`);
    paths.add(path);
  }
  const sourceModule =
    manifest.sourceModule === undefined
      ? prefix +
        (componentExtensions.includes(
          posix.extname(manifest.sourceEntry).toLowerCase(),
        )
          ? manifest.sourceEntry + ".ts"
          : manifest.sourceEntry)
      : manifest.sourceModule;
  if (
    !relativePath(sourceModule) ||
    !sourceModule.startsWith(prefix) ||
    !paths.has(entry) ||
    !paths.has(sourceModule)
  )
    fail("entry or sourceEntry is not listed");
  if (manifest.assets !== undefined && !Array.isArray(manifest.assets))
    fail("assets must be an array");
  const assets = new Map<string, string>();
  for (const path of manifest.assets ?? []) {
    if (
      !relativePath(path) ||
      !path.startsWith(prefix) ||
      posix.extname(path) !== ".css" ||
      paths.has(path) ||
      assets.has(path)
    )
      fail(`unsupported or duplicate CSS asset: ${String(path)}`);
    assets.set(path, await regularFile(directory, path));
  }
  await validateCSSAssets(assets, prefix, directory);
  const files: CrepusGraph["files"] = [];
  let sourceReferenced = false;
  for (const path of paths) {
    const source = await regularFile(directory, path);
    const loader = posix.extname(path).slice(1).toLowerCase() as
      "ts" | "tsx" | "js" | "jsx";
    const transpiler = new Bun.Transpiler({ loader });
    transpiler.transformSync(source);
    for (const dependency of transpiler.scan(source).imports) {
      const specifier = dependency.path;
      validateNativeRuntimeImport(specifier);
      if (
        specifier.includes("\\") ||
        specifier.includes(String.fromCharCode(0)) ||
        /^(?:\/|[a-z]:|file:)/i.test(specifier)
      )
        fail(`unsupported import ${JSON.stringify(specifier)} in ${path}`);
      if (!specifier.startsWith(".")) continue;
      const base = posix.normalize(posix.join(posix.dirname(path), specifier));
      if (!base.startsWith(prefix))
        fail(`import escapes target modules: ${specifier}`);
      const candidates = assets.has(base)
        ? [base]
        : posix.extname(base)
          ? [base]
          : extensions.flatMap((extension) => [
              base + extension,
              `${base}/index${extension}`,
            ]);
      const matches = candidates.filter(
        (candidate) => paths.has(candidate) || assets.has(candidate),
      );
      if (matches.length !== 1)
        fail(
          `missing or ambiguous listed import ${JSON.stringify(specifier)} in ${path}`,
        );
      if (path === entry && matches[0] === sourceModule)
        sourceReferenced = true;
    }
    files.push({ path, source });
  }
  // Legacy manifests cannot identify allocator-remapped SFC entry modules.
  if (manifest.sourceModule !== undefined && !sourceReferenced)
    fail("entry does not reference sourceEntry module");
  files.push(...Array.from(assets, ([path, source]) => ({ path, source })));
  return { entry, files };
}

/** Parse CSS with Bun while resolving exclusively from the already checked inventory. */
async function validateCSSAssets(
  assets: Map<string, string>,
  prefix: string,
  directory: string,
): Promise<void> {
  if (!assets.size) return;
  const root = await realpath(directory);
  const result = await Bun.build({
    root,
    entrypoints: [...assets.keys()].map((path) => join(root, path)),
    plugins: [
      {
        name: "crepus-css-inventory",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === "entry-point-build") {
              const path = posix.relative(root, args.path);
              if (!assets.has(path)) throw new Error("Unlisted CSS entry");
              return { path, namespace: "crepus-css" };
            }
            if (
              args.kind !== "import-rule" ||
              !args.path.startsWith(".") ||
              args.path.includes("\\") ||
              args.path.includes("\0")
            )
              throw new Error(`Unsupported CSS reference: ${args.path}`);
            const path = posix.normalize(
              posix.join(posix.dirname(args.importer), args.path),
            );
            if (!path.startsWith(prefix) || !assets.has(path))
              throw new Error(`Unlisted CSS import: ${args.path}`);
            return { path, namespace: "crepus-css" };
          });
          build.onLoad({ filter: /.*/, namespace: "crepus-css" }, (args) => ({
            contents: assets.get(args.path)!,
            loader: "css",
          }));
        },
      },
    ],
  });
  if (!result.success)
    fail(`CSS validation failed: ${result.logs.map(String).join("; ")}`);
}
