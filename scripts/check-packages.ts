import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

export function checkPackageManifest(path: string): string[] {
  const pkg = JSON.parse(readFileSync(path, "utf8")) as {
    name?: string;
    type?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const errors = pkg.type === "module" ? [] : [`${path}: type must be module`];
  for (const gate of ["format", "lint", "typecheck", "test"]) {
    if (!pkg.scripts?.[gate]) errors.push(`${path}: missing ${gate}`);
  }
  errors.push(...checkDeclaredImports(path, pkg));
  return errors;
}

/**
 * A workspace import satisfied by a devDependency resolves locally and fails
 * for anyone installing from the registry, so runtime imports must be declared.
 */
function checkDeclaredImports(
  path: string,
  pkg: {
    name?: string;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  },
): string[] {
  const srcDir = join(dirname(path), "src");
  if (!existsSync(srcDir)) return [];
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
  const missing = new Set<string>();
  for (const entry of new Bun.Glob("**/*.{ts,tsx}").scanSync(srcDir)) {
    // Template literals hold code these packages *generate*; its imports are
    // the generated project's, not this package's.
    const source = readFileSync(join(srcDir, entry), "utf8").replace(
      /`[\s\S]*?`/g,
      "",
    );
    for (const match of source.matchAll(
      /(?:from|import\()\s*"(@tschk\/[a-z-]+)(?:\/[a-z-]+)?"/g,
    )) {
      const dep = match[1]!;
      if (dep !== pkg.name && !declared.has(dep)) missing.add(dep);
    }
  }
  return [...missing].map(
    (dep) => `${path}: imports ${dep} but does not declare it as a dependency`,
  );
}

function findPackageJsons(): string[] {
  const rootPkg = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as { workspaces?: string[] };
  const paths: string[] = [];
  for (const pattern of rootPkg.workspaces ?? []) {
    if (pattern.endsWith("/*")) {
      const dir = pattern.slice(0, -2);
      const base = join(root, dir);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const pkgPath = join(base, entry.name, "package.json");
          if (existsSync(pkgPath)) paths.push(pkgPath);
        }
      }
    } else {
      const pkgPath = join(root, pattern, "package.json");
      if (existsSync(pkgPath)) paths.push(pkgPath);
    }
  }
  paths.push(join(root, "package.json"));
  return paths;
}

if (import.meta.main) {
  const errors: string[] = [];
  for (const path of findPackageJsons()) {
    errors.push(...checkPackageManifest(path));
  }
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  console.log("All package manifests pass policy.");
}
