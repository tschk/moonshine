/**
 * Drop-in mapping from Waku's client router specifiers onto this package.
 *
 * ```ts
 * import { moonshineWakuPlugin } from "@tschk/moonshine-waku/aliases";
 * await Bun.build({ entrypoints: ["./app.tsx"], plugins: [moonshineWakuPlugin()] });
 * ```
 */
import { join } from "node:path";
import type { BunPlugin } from "bun";

/** Bare specifier each replaced module is served by. */
export const wakuAliases: Readonly<Record<string, string>> = {
  "waku/router/client": "@tschk/moonshine-waku",
  "waku/router": "@tschk/moonshine-waku",
};

/** File in this package backing each alias, relative to `src/`. */
const files: Readonly<Record<string, string>> = {
  "waku/router/client": "index.ts",
  "waku/router": "index.ts",
};

/**
 * `compilerOptions.paths` block for an app's tsconfig, so the type checker
 * follows the same mapping the bundler applies.
 */
export function tsconfigPaths(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(wakuAliases).map(([from, to]) => [from, [to]]),
  );
}

/** Absolute path this package serves `specifier` from, if it is aliased. */
export function resolveAlias(specifier: string): string | undefined {
  const file = files[specifier];
  return file === undefined ? undefined : join(import.meta.dir, file);
}

const filter = /^waku\/router(\/client)?$/;

/** Bun bundler/runtime plugin rewriting Waku router imports to this package. */
export function moonshineWakuPlugin(): BunPlugin {
  return {
    name: "moonshine-waku-aliases",
    setup(build) {
      build.onResolve({ filter }, (args) => {
        const path = resolveAlias(args.path);
        return path === undefined ? undefined : { path };
      });
    },
  };
}
