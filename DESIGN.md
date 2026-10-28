# Moonshine design

Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
signal kernel. Start with signals; add only the routing, rendering, server,
compiler, and deployment layers your project needs.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Kernel         @tschk/moonshine — signals, memos, stores   │
├─────────────────────────────────────────────────────────────┤
│  Contracts      @tschk/moonshine-framework                  │
│                 routes, manifest, renderer, adapter, config │
├─────────────────────────────────────────────────────────────┤
│  Router         @tschk/moonshine-router                     │
│                 pattern compiler, route graph, matcher       │
├─────────────────────────────────────────────────────────────┤
│  Compiler       @tschk/moonshine-compiler                   │
│                 discovery, analysis, bundling, manifest     │
├─────────────────────────────────────────────────────────────┤
│  Server         @tschk/moonshine-server                     │
│                 pipeline, loaders, actions, middleware      │
├─────────────────────────────────────────────────────────────┤
│  Renderers      @tschk/moonshine-react / -solid / crepus    │
│                 SSR, islands, hydration per renderer        │
├─────────────────────────────────────────────────────────────┤
│  Adapters       @tschk/moonshine-deploy-*                   │
│                 Bun, Node, Cloudflare, Vercel               │
└─────────────────────────────────────────────────────────────┘
```

## Kernel

`@tschk/moonshine` stays signal-only by default.

- Exports: `createSignal`, `createMemo`, `createStore`, `batch`, `untrack`, `createResource`.
- No React, DOM, router, server, compiler, or deployment imports in the default export.
- Compatibility subpaths (`/react`, `/runes`, `/router`, `/server`, `/shaders`) remain opt-in.

## Framework contracts

`@tschk/moonshine-framework` is the shared boundary:

- `RouteDefinition` — `id`, `path`, `file`, optional SPA `clientFile`, `mode`, `runtime`, `layouts`, `middleware`, `errorBoundary`, `dataFile`.
- `RenderMode` — `auto | static | ssr | island | spa | api`.
- `RuntimeTarget` — `bun | node | cloudflare | vercel-edge`.
- `MoonshineManifest` — version `1`, framework version, routes, assets, entries, capabilities.
- `Renderer` — `render(context)` and `prerender(context)`.
- `DeploymentAdapter` — `name`, `runtimes`, `capabilities`, `build(manifest, outDir)`.
- `serializeData` — the one HTML-safe JSON serializer, shared by the server data payload (`@tschk/moonshine-server`) and island props (`@tschk/moonshine-react`). Escapes `<`, `>`, `&`, U+2028, and U+2029 and rejects functions, symbols, bigints, and cycles.

All runtime boundaries use `Request`, `Response`, `ReadableStream`, `URL`, `Headers`, and `AbortSignal`.

## Router

`@tschk/moonshine-router` owns the route graph and matcher.

- Patterns use `:param`, `:param?`, and `*rest` syntax.
- Segment precedence: `static > dynamic > optional > rest`.
- Ambiguous routes with equal normalized pattern and precedence are rejected at graph build time.
- Browser navigation is available through `MoonshineRouter`, `Link`, `useParams`, `useNavigate`, and `useLocation`.

## Compiler

`@tschk/moonshine-compiler` turns a project into a build manifest.

- `discoverRoutes` walks `src/routes` and maps files to route patterns.
- `analyzeModule` reads source syntax to decide whether a route is a client boundary, server-only, request-bound, interactive, or an API handler.
- `classifyRoute` selects `static`, `ssr`, `island`, `spa`, or `api` with a human-readable reason.
- `buildBundles` uses `Bun.build` for server and browser entries.
- `buildProject` writes `.moonshine/manifest.json` with version `1`, sorted JSON, and project-relative paths.

Automatic mode falls back to `ssr` when analysis is uncertain and records the reason.

Source-language parsing and lowering belong in Crepuscularity. Moonshine owns
web routing, rendering, data loading, actions, bundling and deployment. The
existing TypeScript route analyzer remains until Crepuscularity exposes an
equivalent module-analysis contract; its current template IR parser does not
provide those facts. Do not replace that analyzer with source-text heuristics.
The handoff needs versioned module facts for client/server boundaries, exported
handlers/loaders/actions, request dependencies, interactivity and unresolved
dynamic imports. Send source and filename together in one batch; keep route
classification here, and fail on unsupported syntax instead of assuming static.

The independent native target lives in `@tschk/moonshine-dom`, using `/ssr`
on the server and `/dom`, `/reactive`
and `/control` in the browser. Framework server/client files remain explicit;
Crepus can compile supported authored JSX/TSX modules into either target.
Existing host re-exports are transitional compatibility paths, not independent
replacements. A versioned module inventory lets the CLI validate and publish
complete JS/TS graphs without changing compiler bytes. Imports, exports, lexical
state and handler closures stay in those modules. CSS and binary assets still
need an upstream contract. Native hydration additionally needs paired SSR
markers and DOM claim instructions for elements and dynamic ranges; fresh mounts
do not establish hydration support.

## Server

`@tschk/moonshine-server` provides a web-standard request pipeline.

- `createRequestHandler` matches a request, builds a module chain, runs middleware, executes an action before parallel loaders, and calls a renderer.
- Loaders and actions receive `RouteContext` with `request`, `params`, `signal`, and `data`.
- Thrown `Redirect` values become redirects; errors route to the nearest `+error` boundary.
- Production error responses omit stack traces.
- Non-GET/HEAD requests to a route with no action get `405` with an `Allow` header, before any loader runs; `HEAD` returns the `GET` headers with no body.

## Renderers

Each renderer owns its output format. They share route and manifest contracts only.

- `@tschk/moonshine-react`: React SSR, streaming, island markers, hydration, and `createApp`.
- `@tschk/moonshine-dom`: independent DOM, SSR and reactive primitives. The framework renderer supports Bun and Node SSR and fresh SPA mounts, not streaming or hydration.
- `@tschk/moonshine-solid`: independent native APIs, signal bridges and explicit DOM/SSR View IR factories, with no Solid runtime dependency. Supported authored components compile through Crepus; precompiled Solid instructions and hydration are unsupported. No shared vnode with React.
- `@tschk/moonshine-svelte`: independent synchronous store protocol, native lifecycle, component context and explicit per-instance event dispatch, with no Svelte runtime dependency. Compiled Svelte instructions and full script lowering remain unfinished. Native DOM consumers explicitly subscribe stores into native signal setters and release subscriptions with their owner. Component source coverage is tracked in `docs/native-sfc-coverage.md`.
- `@tschk/crepus-moonshine`: `.crepus` → Crepus View IR (Rust parser via `@tschk/crepuscularity-wasm`) → React. `@tschk/moonshine-solid` renders the same IR through its own adapter.

## Deployment adapters

Adapters consume the same versioned manifest and compiled artifacts.

| Adapter                              | Target                  | Notable limits                             |
| ------------------------------------ | ----------------------- | ------------------------------------------ |
| `@tschk/moonshine-deploy-bun`        | Bun `Bun.serve`         | Reference platform                         |
| `@tschk/moonshine-deploy-node`       | Node `node:http`        | Fetch-to-HTTP bridge                       |
| `@tschk/moonshine-deploy-cloudflare` | Cloudflare Workers      | Requires `ASSETS` binding for static files |
| `@tschk/moonshine-deploy-vercel`     | Vercel Functions / Edge | Static routes pre-rendered at build        |

`@tschk/moonshine-adapter-conformance` runs the same contract suite against every adapter.

## Host adapters

Distinct from deployment adapters, with explicit replacement boundaries.

| Kind                             | Packages                                       | Host dependency                                                         |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Reimplementing React APIs        | `-next`, `-react-router`, `-tanstack`, `-waku` | Target host removed by supported aliases; React remains                 |
| Independent source APIs          | `-solid`, `-svelte`                            | No host runtime; supported authored components recompile through Crepus |
| Native roots with legacy entries | `-vue`, `-angular`, `-astro`, `-nuxt`          | Optional host peers only for explicit legacy subpaths                   |

Reimplementing adapters import nothing from the host they replace, declare it in
no dependency field and ship an `/aliases` specifier map. Native source APIs do
not implement arbitrary existing host compiler instructions or hydration. Vue,
Angular, Astro and Nuxt retain explicitly documented host APIs until independent
behavior is implemented and verified; their native roots use signal bridges and
lazy native rendering without loading host runtimes, React or parser WASM.

Source-language parsing and lowering belong in Crepuscularity. Moonshine owns the
web runtime and framework contracts. The native renderer expects explicit native
server factories; legacy React/View IR pages must be ported.
`packages/core/test/adapters-contract.test.ts` checks adapter names, forbidden
host dependencies/imports and required subpaths; isolated-package tests verify
native root imports and rendering without hosts installed. Those checks do not
establish full source or compiler ABI coverage.

## Configuration

`moonshine.config.ts` is optional. Defaults are: `src/routes`, Bun runtime, automatic route modes, and the React renderer when `moonshine new` is invoked with `--react`.

Programmatic routes can be supplied through `defineRoute` and merged with filesystem routes.

## Development commands

The CLI in `@tschk/moonshine-cli` orchestrates the compiler and adapters.

- `moonshine new <name> [--native|--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]`
- `moonshine adopt [dir] [--dry-run] [--force]` — alias an existing Next app's `next/*` specifiers onto `@tschk/moonshine-next` via `compilerOptions.paths`; edits no source files
- `moonshine build [dir] [--adapter bun|node|cloudflare|vercel]`
- `moonshine inspect [path] [--json]`
- `moonshine preview [dir] [--port <n>]`
- `moonshine dev [dir]`
- `moonshine compile [file]`

## Quality gates

Every TypeScript package provides `format`, `lint`, `typecheck`, and `test` scripts. Root gates run `tsc` and `tsgo`.

- `bun run format` — Prettier check
- `bun run lint` — Oxlint
- `bun run typecheck` — TypeScript
- `bun run typecheck:native` — `tsgo`
- `bun run check` — typecheck, package policy, catalog sync, adapter checks
- `bun run check:size` — kernel bundle budget
- `bun test`

See [docs/ROUTING.md](./docs/ROUTING.md), [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md), [docs/MANIFEST.md](./docs/MANIFEST.md), and [docs/COMPARE.md](./docs/COMPARE.md).
