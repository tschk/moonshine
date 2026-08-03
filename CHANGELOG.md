# Moonshine 0.3.6

## Compiler

- The server bundle now registers the layouts, middleware, and error boundaries
  its routes render through, not just the page and its data module. They were
  absent, so the renderer fell back to `await import(file)` on their source
  paths. That resolves in a checkout, where the source sits beside the build
  output, and fails in a deployed image that ships only the build — a route
  renders locally and returns 500 in production. It also fails outright on a
  runtime that cannot resolve a dynamic import, which is the case
  `registerRouteModules` exists for.

# Moonshine 0.3.5

## Compiler

- Browser bundles now begin with `globalThis.process ??= { env: {} };`. Client
  code and its dependencies routinely read `process.env.X`; browsers have no
  `process`, so that reference threw `ReferenceError: process is not defined`
  while the client entry module was still evaluating — before any component
  rendered and before an error boundary could mount. The page stayed blank with
  an empty console, which is close to undiagnosable from the outside. The shim
  uses `??=`, so an application that injects its own public values ahead of the
  bundle keeps them. Values are deliberately not inlined: inlining the process
  environment into a browser bundle would ship whatever secrets the build host
  holds. Server bundles are untouched, where a real `process` exists and
  shimming it would mask genuine environment faults.

# Moonshine 0.3.3

## Host adapters

- `@tschk/moonshine-next` reimplements the Next.js API surface instead of re-exporting it: `next/link`, `next/navigation`, `next/image`, `next/script`, `next/dynamic`, `next/headers`, and `next/font/google` are built on the moonshine router and signal runtime, and `next` is no longer a dependency, peer dependency, or devDependency.
- New `@tschk/moonshine-react-router`, `@tschk/moonshine-tanstack`, and `@tschk/moonshine-waku` reimplement the react-router / `@remix-run/react`, TanStack Router / Start, and Waku client router APIs on `@tschk/moonshine/router`. None imports or depends on the framework it replaces.
- Each reimplementing adapter ships an `/aliases` specifier map so an application can alias the host specifier and drop the host package.
- `packages/core/test/adapters-contract.test.ts` enforces the adapter set, the forbidden-dependency and forbidden-import rules, and the required subpath exports.

## CLI

- New `moonshine adopt [dir] [--dry-run] [--force]`. It points at an existing App Router or Pages Router project, writes `compilerOptions.paths` aliasing every implemented `next/*` specifier at the adapter files inside the project's own `node_modules`, writes `moonshine.config.ts`, and edits no source files. It ends with a scorecard listing what it cannot carry over: middleware, `next.config`, the metadata API, ISR, server actions, async server components, and image optimization.
- `discoverRoutes` gains a `convention` option (`next-app`, `next-pages`) so `app/` and `pages/` trees are read in place.

## Security

- `errorResponse` no longer echoes a thrown value's message in the 500 body outside development mode; `mode` is optional, so the previous default disclosed internal detail.
- `Link` passes `href` through `safeHref`, rejecting script-capable schemes and control characters. Modifier and middle clicks defer to the browser, so an unfiltered `href` was a stored-XSS sink.
- Static file serving rejects dot-prefixed path segments (`.well-known` still allowed) and sets `X-Content-Type-Options: nosniff`.
- Static containment compares real paths, so a symlink inside the root pointing outside it is no longer served. `@tschk/moonshine-deploy-node` reuses the same check (exported as `isContained`) and sets `nosniff`.
- `@tschk/moonshine-deploy-node` accepts the `Host` header only as a bare host with an optional port (bracketed IPv6 included) before building `request.url`, and otherwise falls back to localhost.

## Correctness

- `cloudflareFetch` builds its handler with the `modules` map, so API route loaders, actions, and handlers actually run and page routes resolve their component.
- `serializeIslandProps` detects cycles by walking the ancestor chain instead of a global visited set, so an object referenced twice in the payload is no longer rejected.

## Performance

- `createMemo` no longer unsubscribes and resubscribes every dependency on each recomputation when the dependency set is unchanged. A single `signal.set()` was quadratic in graph depth and is now linear (memo chain, µs per set: depth 50 156.6 → 11.1; depth 800 52792.8 → 135.3).
- `useSignal` keeps one `useSyncExternalStore` subscribe callback across renders (20 unrelated re-renders: 41 subscribes / 40 unsubscribes → 1 / 0).
- `createRequestHandler` compiles the route graph once per handler instead of per request (20 routes 26.8µs → 6.0µs; 120 routes 619µs → 31µs).
- `matchRoutes` skips routes whose literal first segment differs and selects the best match linearly (20 routes 6.0µs → 0.58µs; 120 routes 31µs → 1.45µs).
- `MoonshineRouter` memoizes the compiled route graph.
- The static root's real path is resolved once per process; the requested file is still resolved per request.
- Dither canvases hoist fixed-alpha `rgba(...)` strings out of the pixel loop; output is byte-identical (600×300 scan 5.07ms → 0.31ms).

## Components

- Dither paint internals (`BAYER`, `paintColumn`, `paintSparkline`, `resample`, `backingSize`, `sparklineColumnTops`, `PALETTE`, `rgb`, `seedOfColor`) are no longer exported from the package root. The `./dither` and `./themes` subpaths are unchanged.
- Dither chart canvas scaffolding collapsed into a single `DitherCanvas`.

## Migration from 0.3.2

- All public packages now use version `0.3.3` and internal dependencies use `^0.3.3`.
- `@tschk/moonshine-next` no longer re-exports Next. Anything relying on it forwarding to a real `next` install must move to the reimplemented surface; see the package README for the supported and unsupported lists.
- The nine removed component-root exports must be imported from `@tschk/moonshine-components/dither` instead.

# Moonshine 0.3.2

## Security

- Client output builds into `.moonshine/public/`. The build directory was previously handed to the static file server wholesale, so `GET /dist/server.js` returned bundled server code and `GET /manifest.json` leaked the route map and absolute build paths. The preview server and the bun/node deploy entries now serve only the public directory.
- Static file containment compares real paths, so a symlink inside the static root pointing outside it is rejected.

## Packaging

- Five packages imported a `@tschk` package they declared only as a devDependency, which resolves through the workspace but fails when installed from npm. The four deploy adapters now depend on `@tschk/moonshine-adapter-conformance`, and the CLI on `@tschk/crepus-moonshine` with `@tschk/moonshine-solid` optional.
- `check-packages` fails on an undeclared runtime import, ignoring template literals because that code belongs to the generated project.
- `@tschk/crepus-moonshine` parses `.crepus` through the published `@tschk/crepuscularity-wasm` Rust parser; the TypeScript parser is gone. `@tschk/moonshine-solid` renders the same IR from the shared WASM types.
- The release version-lockstep check is scoped to in-repo packages.

## Adapters and examples

- Removed eight delegation-only host adapters (`adapter-angular`, `adapter-astro`, `adapter-svelte`, `adapter-waku`, `adapter-nuxt`, `adapter-vue`, `adapter-remix`, `adapter-tanstack`). They were pure re-export wrappers. `adapter-solid`, `adapter-next`, and `adapter-conformance` remain.
- Removed `examples/catalog-gallery`, `examples/vite-crepus`, `examples/shaders-island`, and the internal-only benchmark and packed-test scripts.
- Removed the `Meter` and `Input` thin wrappers from `@tschk/moonshine-components`.

## View IR

- `link` node kind: `CrepusLinkNode` renders as an `<a>` with `href`, `target`, `rel`, and content or children.

## Migration from 0.3.1

- All public packages now use version `0.3.2` and internal dependencies use `^0.3.2`.
- The eight removed adapters have no replacement; import the host library directly, or use a reimplementing adapter where one exists in 0.3.3.
- Static assets are read from `.moonshine/public/`. Anything serving `.moonshine/` directly must be repointed.

# Moonshine 0.3.1

## Security

- `isSafeRedirect` now explicitly rejects embedded CR/LF control characters in redirect locations (AUD-007).
- Full re-audit confirmed no regressions in route precedence, request cancellation, serialization, static traversal, cache isolation, adapter capability rejection, or compatibility exports.

## Benchmarks

- Added `scripts/benchmark-competitive.ts` measuring kernel, island, React, and Solid bundle sizes plus Bun.serve / Moonshine static / SSR request latency.
- Refreshed internal benchmark results in `docs/audits/benchmark-results.md`.
- Added `docs/audits/competitive-benchmarks.md` with methodology and caveats.
- Updated `docs/COMPARE.md` with a "Measured on this machine" section.

## Audit

- Added `docs/audits/0.3.1-framework-audit.md` with full correctness, security, complexity, and gate results.

## Migration from 0.3.0

- All public packages now use version `0.3.1` and internal dependencies use `^0.3.1`.
- No breaking changes; drop-in upgrade from 0.3.0.

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
