/**
 * Drop-in mapping from the react-router specifiers onto this package.
 *
 * An existing app keeps its imports — the bundler rewrites the specifier, so no
 * source changes are needed.
 *
 * ```ts
 * import { moonshineReactRouterPlugin } from "@tschk/moonshine-react-router/aliases";
 * await Bun.build({ entrypoints: ["./app.tsx"], plugins: [moonshineReactRouterPlugin()] });
 * ```
 */
import { join } from "node:path";
import type { BunPlugin } from "bun";

/** Bare specifier each replaced package is served by. */
export const reactRouterAliases: Readonly<Record<string, string>> = {
  "react-router": "@tschk/moonshine-react-router",
  "react-router-dom": "@tschk/moonshine-react-router",
  "@remix-run/react": "@tschk/moonshine-react-router",
};

/** File in this package backing each alias, relative to `src/`. */
const files: Readonly<Record<string, string>> = {
  "react-router": "index.ts",
  "react-router-dom": "index.ts",
  "@remix-run/react": "index.ts",
};

/**
 * `compilerOptions.paths` block for an app's tsconfig, so the type checker
 * follows the same mapping the bundler applies.
 */
export function tsconfigPaths(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(reactRouterAliases).map(([from, to]) => [from, [to]]),
  );
}

/** Absolute path this package serves `specifier` from, if it is aliased. */
export function resolveAlias(specifier: string): string | undefined {
  const file = files[specifier];
  return file === undefined ? undefined : join(import.meta.dir, file);
}

const filter = /^(react-router|react-router-dom|@remix-run\/react)$/;

/** Bun bundler/runtime plugin rewriting react-router imports to this package. */
export function moonshineReactRouterPlugin(): BunPlugin {
  return {
    name: "moonshine-react-router-aliases",
    setup(build) {
      build.onResolve({ filter }, (args) => {
        const path = resolveAlias(args.path);
        return path === undefined ? undefined : { path };
      });
    },
  };
}
