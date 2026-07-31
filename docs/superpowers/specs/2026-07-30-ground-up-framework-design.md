# Moonshine Ground-Up Framework Design

## Purpose

Moonshine becomes a ground-up, Bun-first web framework assembled from a
hyperminimal signal kernel. Installing only `@tschk/moonshine` remains a small,
framework-neutral choice. Adding routing, rendering, compilation, server, and
deployment packages produces a complete metaframework without forcing those
features into the root package.

The framework optimizes each route independently. Static pages, server-rendered
pages, hydrated islands, client-only applications, and API handlers can coexist
in one project. Defaults are automatic and conservative; explicit configuration
always wins.

## Principles

1. **Root stays minimal.** `@tschk/moonshine` exports signals and resources only.
2. **Pay only for imports.** Router, renderer, compiler, server, and deployment
   code live outside the default export and tree-shake independently.
3. **Web standards form boundaries.** Runtime and adapter contracts use
   `Request`, `Response`, `ReadableStream`, `URL`, and standard headers.
4. **Bun is the reference platform.** Bun supplies package management,
   bundling, tests, and the reference server without hiding platform APIs.
5. **Hybrid is route-local.** Rendering mode, runtime, cache policy, and
   hydration are selected per route and inherited through layouts.
6. **Automation must be explainable.** Compiler decisions appear in the build
   manifest and CLI output. Uncertain analysis falls back to SSR.
7. **Renderers keep ownership.** React, Solid, and Crepus have independent
   renderers. Moonshine does not invent a shared vnode.
8. **Adapters target one stable artifact.** Every deployment provider consumes
   the same typed, versioned build manifest and passes one conformance suite.
9. **Native code must earn its cost.** TypeScript remains the portable public
   runtime. C++ acceleration is added only when benchmarks prove a hot path and
   a TypeScript fallback remains available.

## Package Architecture

### Kernel

`@tschk/moonshine` remains signal-only by default:

- signals, memos, effects, stores, batching, scopes, and resources
- no React, DOM, router, server, compiler, or deployment imports
- browser, server, worker, and embedded JavaScript compatibility

Existing optional compatibility subpaths remain available while larger
features move behind dedicated packages where that prevents accidental weight.

### Framework Packages

| Package                               | Responsibility                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `@tschk/moonshine-router`             | Route matching, navigation, layouts, parameters, and route data contracts          |
| `@tschk/moonshine-compiler`           | Filesystem discovery, static analysis, route graph, bundles, and build manifest    |
| `@tschk/moonshine-server`             | Web-standard request pipeline, middleware, loaders, actions, errors, and streaming |
| `@tschk/moonshine-react`              | React SSR, hydration, islands, and client navigation                               |
| `@tschk/moonshine-solid`              | Solid rendering and signal bridges without a shared vnode                          |
| `@tschk/crepus-moonshine`             | Crepus View IR rendering and emit integration                                      |
| `@tschk/moonshine-adapter-bun`        | Reference Bun server and static asset delivery                                     |
| `@tschk/moonshine-adapter-node`       | Node HTTP deployment                                                               |
| `@tschk/moonshine-adapter-cloudflare` | Workers and Pages deployment                                                       |
| `@tschk/moonshine-adapter-vercel`     | Vercel functions, edge, and static output                                          |
| `@tschk/moonshine-cli`                | `new`, `dev`, `build`, `preview`, `inspect`, and `deploy` orchestration            |

Current host-library adapters remain bridges. They do not become framework
internals and continue exposing their host libraries on documented subpaths.

## Project and Routing Model

Filesystem routing is the default. A programmatic manifest can add or replace
routes for generated applications and advanced integrations.

```text
src/
  routes/
    +layout.tsx
    +error.tsx
    +middleware.ts
    index.tsx
    about.tsx
    blog/
      [slug].tsx
      [slug].data.ts
    api/
      health.server.ts
  entry.client.tsx
  entry.server.tsx
moonshine.config.ts
```

Conventions are deliberately few:

- `index.tsx` maps to its directory path.
- `[name]`, `[...name]`, and `[[name]]` define dynamic, rest, and optional
  parameters.
- `+layout`, `+error`, and `+middleware` inherit through descendants.
- `.server` files cannot enter client bundles.
- `.client` files define explicit browser boundaries.
- `.data` files export loaders, actions, headers, and cache policy.

Programmatic routes use the same `RouteDefinition` type produced by filesystem
discovery. There is one route graph and one matcher regardless of source.

## Rendering Modes

Each route resolves to one mode:

| Mode     | Output                                                         |
| -------- | -------------------------------------------------------------- |
| `static` | HTML and assets generated at build time                        |
| `ssr`    | HTML generated for each request, optionally streamed           |
| `island` | Static or SSR shell plus independently hydrated client entries |
| `spa`    | Client entry and fallback shell                                |
| `api`    | Web-standard request handler without UI rendering              |

Route configuration accepts `mode: "auto" | "static" | "ssr" | "island" |
"spa" | "api"`. Layout configuration supplies inherited defaults; child routes
may override them.

### Automatic Selection

The compiler applies rules in this order:

1. Explicit route or inherited configuration.
2. API handler exports select `api`.
3. Explicit `.client` boundary at route root selects `spa`.
4. Request-bound loaders, actions, cookies, headers, or server-only imports
   select `ssr`.
5. Interactive subtrees inside otherwise renderable output select `island`.
6. Deterministic renderable routes select `static`.
7. Unresolved dynamic behavior selects `ssr` and emits an explanation.

Compiler analysis never executes arbitrary application modules merely to guess
a mode. Build-time execution occurs only for routes already classified static.

## Compiler and Build Manifest

The compiler uses the TypeScript compiler API for syntax and module-graph
analysis, while TypeScript 7 and `tsgo` provide fast validation. Bun performs
server and browser bundling. Moonshine owns route analysis and artifact layout,
not a second general-purpose bundler.

Every build writes `.moonshine/manifest.json` with a versioned schema:

```ts
type MoonshineManifest = {
  version: 1;
  frameworkVersion: string;
  routes: RouteArtifact[];
  assets: AssetArtifact[];
  entries: RuntimeEntries;
  capabilities: CapabilitySet;
};
```

Each route artifact records matcher data, rendering mode, runtime target,
server and client entries, static output, island entries, middleware chain,
cache policy, headers, and the reason for every automatic decision.

`moonshine inspect` prints this data without rebuilding. The JSON format is the
stable deployment boundary. Schema changes require a manifest version change.

## Request and Data Flow

1. Deployment adapter receives a request and loads the build manifest.
2. Shared matcher resolves route and parameters.
3. Middleware executes outermost layout to route.
4. Action executes for matching mutation requests.
5. Loaders execute in parallel where dependencies permit and receive an
   `AbortSignal` tied to request cancellation.
6. Renderer produces static HTML, streamed SSR, island markers, or SPA shell.
7. Response headers and cache policy are merged from root to leaf, with leaf
   values taking precedence.
8. Adapter maps standard response and cache metadata to provider primitives.

Loaders and actions return serializable data, `Response`, or typed redirects.
Thrown `Response` values and errors resolve through the nearest `+error`
boundary. Request-scoped state never uses module-global caches.

## Islands and Renderer Contract

The compiler identifies explicit client boundaries and emits one browser entry
per reachable island group. Shared dependencies are split by Bun. Server HTML
contains stable island identifiers, serialized props, and entry references.

Renderer packages implement a small contract covering:

- render full route to string or stream
- render static route during build
- encode and hydrate islands
- expose renderer-specific client entry generation

React, Solid, and Crepus may optimize internally. They share route and manifest
contracts only. Solid keeps its native rendering model; Crepus keeps View IR;
React remains opt-in.

## Deployment Adapters

Adapters consume the manifest and compiled artifacts rather than framework
source. Four adapters ship against one conformance suite:

- Bun: single server, static files, streaming, graceful shutdown
- Node: Fetch-to-HTTP bridge and standalone output
- Cloudflare: Worker handler, assets binding, cache integration
- Vercel: functions, edge-compatible routes, and static assets

Unsupported provider capabilities fail during build with the affected route and
required capability. Adapters cannot silently downgrade streaming, runtime, or
cache semantics.

## Configuration

`moonshine.config.ts` is optional. Defaults discover `src/routes`, choose Bun,
use automatic route modes, and enable no deployment-specific behavior.

Configuration covers only project-wide concerns:

- source and output directories
- renderer packages
- deployment adapter
- default rendering mode and runtime
- middleware and compiler extensions
- strictness for automatic decisions

Route behavior stays beside the route. Environment-specific secrets remain in
platform environment variables and never enter generated manifests.

## Optional Heavy Layers

Full-stack features remain imports rather than kernel responsibilities:

- loaders, actions, middleware, sessions, and streaming from server packages
- cache providers and revalidation from an optional cache package
- content collections from an optional content package
- image and font pipelines from optional integrations
- React Server Components from an experimental React package after stable
  route, manifest, and streaming contracts exist

Moonshine does not ship authentication, databases, billing, or application
state policy. Those compose through standard request handlers and ecosystem
libraries.

## Native Acceleration Policy

No C++ code enters the first framework release. Compiler phases expose timing
and memory metrics. A native implementation is allowed only when:

1. a checked-in benchmark shows a meaningful bottleneck,
2. native code measurably improves it across representative projects,
3. a portable TypeScript implementation remains the fallback,
4. prebuilt binaries cover supported platforms without install scripts, and
5. the native boundary is versioned and independently testable.

Likely candidates are route graph scanning or manifest serialization, not
signals or browser runtime behavior.

## Development Experience

- `moonshine new app` creates the minimal Bun full-stack project.
- Optional flags add React, Solid, Crepus, content, or a deployment adapter.
- `moonshine dev` discovers routes, serves through Bun, rebuilds affected
  entries, and reports rendering decisions.
- `moonshine build` validates routes, generates artifacts, prerenders static
  routes, and invokes the selected adapter.
- `moonshine preview` runs built output through the adapter contract.
- `moonshine inspect` explains route graph, bundle entries, and auto modes.

Generated projects author `.tsx`; `.crepus` continues compiling to `.tsx` and
imports `renderCrepusIr` and `createApp` through the existing emit contract.

## Error Handling and Safety

- Filesystem routes reject ambiguous paths and duplicate route precedence.
- Static file serving preserves traversal protection and explicit MIME types.
- Serialized island and loader data escape HTML and reject unsupported values.
- Request cancellation reaches middleware, loaders, actions, and renderers.
- Development errors include route and source location; production errors avoid
  leaking stack traces.
- Build output is deterministic for identical source and environment inputs.

## Testing and Quality Gates

Each TypeScript package supplies formatting, linting, type-checking, and test
commands runnable through Bun. Root gates run both `tsc` and `tsgo`.

Coverage includes:

- route parsing and precedence
- automatic mode decisions and explanations
- static, SSR, island, SPA, and API fixtures
- loader/action cancellation and error boundaries
- manifest schema snapshots and backwards compatibility
- renderer hydration and serialization
- deployment adapter conformance on Bun, Node, Cloudflare, and Vercel
- generated-project smoke tests using published package layouts
- bundle-size budgets for kernel and minimal scaffold

CI tests Linux and macOS where platform behavior differs. Release publication
requires every gate, package dry-runs, provenance-compatible npm publication,
and clean installation fixtures.

## Documentation Alignment

Moonshine documentation will describe one identity consistently:

> Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
> signal kernel. Start with signals; add only the routing, rendering, server,
> compiler, and deployment layers a project needs.

`README.md`, `DESIGN.md`, `docs/COMPARE.md`, package READMEs, examples, and
`AGENTS.md` will remove stale claims that Moonshine permanently excludes a
compiler or metaframework capabilities. Comparisons will distinguish optional
capability from default weight and will avoid unverified performance claims.

The public READMEs for `undivisible/undivisible`, `tschk/tsc.hk`, and
`tschk/.github` will adopt the same concise description and link to canonical
Moonshine documentation without duplicating implementation details.

## Delivery Sequence

1. Align documentation and package quality gates.
2. Define route graph and versioned manifest contracts.
3. Implement filesystem discovery and programmatic routes.
4. Implement compiler classification and inspection output.
5. Implement shared request pipeline, loaders, actions, and boundaries.
6. Implement static, SSR, island, SPA, and API output for React.
7. Integrate Solid and Crepus renderer contracts.
8. Ship Bun and Node adapters with conformance tests.
9. Ship Cloudflare and Vercel adapters with installation fixtures.
10. Audit correctness, security, performance, and over-engineering.
11. Update comparisons and public profile documentation.
12. Verify packages, tag the selected semantic version, and publish to npm.

Each sequence item must leave all existing quality gates green. Releases do not
contain placeholder renderers, mock deployment behavior, or undocumented
capability downgrades.

## Success Criteria

- Default kernel remains signal-only and independently installable.
- One project mixes all five route modes with automatic and explicit selection.
- Every automatic compiler choice is inspectable and deterministic.
- Bun, Node, Cloudflare, and Vercel pass the same deployment contract suite.
- React, Solid, and Crepus retain native rendering ownership.
- Minimal projects do not install optional framework layers.
- Documentation and comparison claims match tested behavior.
- Published packages install, build, and run outside the monorepo.
