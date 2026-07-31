/**
 * Drop-in mapping from the TanStack Router specifiers onto this package.
 *
 * ```ts
 * import { moonshineTanstackPlugin } from "@tschk/moonshine-tanstack/aliases";
 * await Bun.build({ entrypoints: ["./app.tsx"], plugins: [moonshineTanstackPlugin()] });
 * ```
 */
import { join } from "node:path";
import type { BunPlugin } from "bun";

/** Bare specifier each replaced package is served by. */
export const tanstackAliases: Readonly<Record<string, string>> = {
  "@tanstack/react-router": "@tschk/moonshine-tanstack",
  "@tanstack/router-core": "@tschk/moonshine-tanstack",
};

/** File in this package backing each alias, relative to `src/`. */
const files: Readonly<Record<string, string>> = {
  "@tanstack/react-router": "index.ts",
  "@tanstack/router-core": "index.ts",
};

/**
 * `compilerOptions.paths` block for an app's tsconfig, so the type checker
 * follows the same mapping the bundler applies.
 */
export function tsconfigPaths(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(tanstackAliases).map(([from, to]) => [from, [to]]),
  );
}

/** Absolute path this package serves `specifier` from, if it is aliased. */
export function resolveAlias(specifier: string): string | undefined {
  const file = files[specifier];
  return file === undefined ? undefined : join(import.meta.dir, file);
}

const filter = /^@tanstack\/(react-router|router-core)$/;

/** Bun bundler/runtime plugin rewriting TanStack imports to this package. */
export function moonshineTanstackPlugin(): BunPlugin {
  return {
    name: "moonshine-tanstack-aliases",
    setup(build) {
      build.onResolve({ filter }, (args) => {
        const path = resolveAlias(args.path);
        return path === undefined ? undefined : { path };
      });
    },
  };
}
