import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

export function checkPackageManifest(path: string): string[] {
  const pkg = JSON.parse(readFileSync(path, "utf8")) as {
    type?: string;
    scripts?: Record<string, string>;
  };
  const errors = pkg.type === "module" ? [] : [`${path}: type must be module`];
  for (const gate of ["format", "lint", "typecheck", "test"]) {
    if (!pkg.scripts?.[gate]) errors.push(`${path}: missing ${gate}`);
  }
  return errors;
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
