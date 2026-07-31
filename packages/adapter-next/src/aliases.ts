/**
 * Drop-in mapping from `next/*` specifiers onto this package.
 *
 * An existing Next app keeps writing `import Link from "next/link"` — the
 * bundler rewrites the specifier, so no source import changes.
 *
 * ```ts
 * import { moonshineNextPlugin } from "@tschk/moonshine-next/aliases";
 * await Bun.build({ entrypoints: ["./app.tsx"], plugins: [moonshineNextPlugin()] });
 * ```
 */
import { join } from "node:path";
import type { BunPlugin } from "bun";

/** Bare specifier each `next/*` subpath is served by. */
export const nextAliases: Readonly<Record<string, string>> = {
  "next/link": "@tschk/moonshine-next/link",
  "next/navigation": "@tschk/moonshine-next/navigation",
  "next/image": "@tschk/moonshine-next/image",
  "next/script": "@tschk/moonshine-next/script",
  "next/headers": "@tschk/moonshine-next/headers",
  "next/dynamic": "@tschk/moonshine-next/dynamic",
  "next/font/google": "@tschk/moonshine-next/font/google",
};

/** File in this package backing each alias, relative to `src/`. */
const files: Readonly<Record<string, string>> = {
  "next/link": "link.ts",
  "next/navigation": "navigation.ts",
  "next/image": "image.ts",
  "next/script": "script.ts",
  "next/headers": "headers.ts",
  "next/dynamic": "dynamic.ts",
  "next/font/google": "font/google.ts",
};

/**
 * `compilerOptions.paths` block for an app's tsconfig, so the type checker
 * follows the same mapping the bundler applies.
 */
export function tsconfigPaths(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(nextAliases).map(([from, to]) => [from, [to]]),
  );
}

/** Absolute path this package serves `specifier` from, if it is aliased. */
export function resolveAlias(specifier: string): string | undefined {
  const file = files[specifier];
  return file === undefined ? undefined : join(import.meta.dir, file);
}

const filter =
  /^next\/(link|navigation|image|script|headers|dynamic|font\/google)$/;

/** Bun bundler/runtime plugin rewriting `next/*` to this package. */
export function moonshineNextPlugin(): BunPlugin {
  return {
    name: "moonshine-next-aliases",
    setup(build) {
      build.onResolve({ filter }, (args) => {
        const path = resolveAlias(args.path);
        return path === undefined ? undefined : { path };
      });
    },
  };
}
