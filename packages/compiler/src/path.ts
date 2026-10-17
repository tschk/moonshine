import { realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Resolve existing symlink ancestors even when the final path does not exist yet. */
export async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    return join(await canonicalPath(parent), basename(absolute));
  }
}
