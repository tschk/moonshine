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
- Optional compatibility subpaths (`/react`, `/runes`, `/router`, `/server`, `/shaders`) are preserved during the `0.3.x` line.

## Framework contracts

`@tschk/moonshine-framework` is the shared boundary:

- `RouteDefinition` — `id`, `path`, `file`, `mode`, `runtime`, `layouts`, `middleware`, `errorBoundary`, `dataFile`.
- `RenderMode` — `auto | static | ssr | island | spa | api`.
- `RuntimeTarget` — `bun | node | cloudflare | vercel-edge`.
- `MoonshineManifest` — version `1`, framework version, routes, assets, entries, capabilities.
- `Renderer` — `render(context)` and `prerender(context)`.
- `DeploymentAdapter` — `name`, `runtimes`, `capabilities`, `build(manifest, outDir)`.

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

## Server

`@tschk/moonshine-server` provides a web-standard request pipeline.

- `createRequestHandler` matches a request, builds a module chain, runs middleware, executes loaders and actions in parallel, and calls a renderer.
- Loaders and actions receive `RouteContext` with `request`, `params`, `signal`, and `data`.
- Thrown `Redirect` values become redirects; errors route to the nearest `+error` boundary.
- Production error responses omit stack traces.
- `serializeData` escapes `<`, `>`, `&`, U+2028, and U+2029 and rejects functions, symbols, and cycles.

## Renderers

Each renderer owns its output format. They share route and manifest contracts only.

- `@tschk/moonshine-react`: React SSR, streaming, island markers, hydration, and `createApp`.
- `@tschk/moonshine-solid`: Solid elements via `solid-js/h` and signal bridges. No shared vnode with React.
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

Distinct from deployment adapters, and split into two kinds.

| Kind           | Packages                                       | Host dependency                          |
| -------------- | ---------------------------------------------- | ---------------------------------------- |
| Reimplementing | `-next`, `-react-router`, `-tanstack`, `-waku` | none — the host is removed by aliasing   |
| Hosting        | `-solid`                                       | peer dependency, re-exported on subpaths |

Reimplementing adapters are only possible where the host's public API is
ordinary React. They import nothing from the host, declare it in no dependency
field, and ship an `/aliases` specifier map. Hosting adapters are required
wherever the component format is compiled (Svelte, Vue, Angular, `.astro`).
`packages/core/test/adapters-contract.test.ts` enforces the adapter set, the
forbidden dependencies and imports, and the required subpath exports.

## Configuration

`moonshine.config.ts` is optional. Defaults are: `src/routes`, Bun runtime, automatic route modes, and the React renderer when `moonshine new` is invoked with `--react`.

Programmatic routes can be supplied through `defineRoute` and merged with filesystem routes.

## Development commands

The CLI in `@tschk/moonshine-cli` orchestrates the compiler and adapters.

- `moonshine new <name> [--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]`
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
