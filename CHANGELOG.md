# Moonshine 0.3.0

## Kernel compatibility

- `@tschk/moonshine` default export remains signal-only.
- `packages/core/src/router.ts`, `packages/core/src/server.ts`, and `packages/core/src/react.ts` are compatibility re-exports from the new framework packages.
- Kernel bundle target stays within 12 KiB minified.

## Hybrid routes

- Renderer-neutral route graph in `@tschk/moonshine-router` with static, dynamic, optional, and rest segment precedence.
- Filesystem route discovery in `@tschk/moonshine-compiler` maps `index.tsx`, `[slug].tsx`, `[[tab]].tsx`, `[...path].tsx`, and `.server.ts` to route patterns.
- Programmatic and filesystem routes merge and feed a shared `createRouteGraph`.
- Five output modes: `static`, `ssr`, `island`, `spa`, `api`.

## Compiler and manifest

- `MoonshineManifest` is versioned at `1` and emitted as sorted JSON to `.moonshine/manifest.json`.
- Route classification analyzes module facts via the TypeScript AST without executing code.
- `moonshine inspect` prints one deterministic line per route and `--json` prints the manifest.
- Asset hashing uses `Bun.CryptoHasher("sha256")`.

## Server data flow

- `createRequestHandler` in `@tschk/moonshine-server` runs middleware, loaders, and renderers in order and respects `AbortSignal`.
- Serialization escapes `<`, `>`, `&`, U+2028, U+2029 and rejects functions, symbols, and cycles.
- `redirect` enforces same-origin or relative locations and blocks header injection.
- `resolveStaticPath` rejects traversal, malformed percent-encoding, null bytes, and separators.

## Renderers

- `@tschk/moonshine-react` provides SSR, streaming, island encoding, and hydration.
- `@tschk/moonshine-solid` and `@tschk/crepus-moonshine` remain independent renderers with no shared vnode.
- React, Solid, and Crepus renderers implement the same `Renderer` contract from `@tschk/moonshine-framework`.

## Deployment adapters

- New packages: `@tschk/moonshine-deploy-bun`, `@tschk/moonshine-deploy-node`, `@tschk/moonshine-deploy-cloudflare`, `@tschk/moonshine-deploy-vercel`.
- Adapters consume `MoonshineManifest` and produce host-specific output.
- Node bridge filters hop-by-hop and framing headers.
- Cloudflare and Vercel adapters validate runtime and capability support.

## CLI

- `moonshine new`, `dev`, `build`, `preview`, `inspect`, `compile`.
- `moonshine build --adapter bun|node|cloudflare|vercel`.
- `moonshine inspect --json`.

## Migration from 0.2.x

- All public packages now use version `0.3.0` and internal dependencies use `^0.3.0`.
- Replace `workspace:*` and `file:` references in published manifests with `^0.3.0`.
- Import router, server, and React from `/router`, `/server`, and `/react` subpaths on `@tschk/moonshine` or directly from the framework packages.

## Verified limitations

- npm publish requires an authenticated npm account and GPG signing for git tags; these are not configured in CI by default.
- Package ownership can only be verified after packages exist on the registry.
- External install verification requires the release to be published.
