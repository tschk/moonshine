# Capability audit: November 2026

Moonshine already has a route graph, server loaders and actions, React hydration,
and an opt-in client data router. The opportunities below connect those pieces
and extend the independent native runtime. They are proposals, not supported
host-framework compatibility claims.

## Native hydration and islands

Native SSR can render source components, but the compiler rejects native island
mode and route hydration. Solid's `hydrateSolid` explicitly throws. Define a
bounded Crepus-to-runtime contract that attaches behavior to existing DOM without
claiming compatibility with arbitrary host-compiled components. Test DOM reuse,
event attachment, mismatch handling, and cleanup against real SSR output.

Evidence: `packages/compiler/src/manifest.ts` and
`packages/adapter-solid/src/framework.ts`.

## Connected route data

The data router supports cancellation, submissions, revalidation, and explicit
location-bound initial data. Applications still transport and validate SSR data
themselves. Nested loader matches, a route cache, and redirect-to-navigation
handling are absent. Connect SSR data to the client runtime with an explicit,
HTML-safe transport and well-defined ownership, error, and invalidation rules.
Then expose matched data through adapter APIs without claiming full host data
router compatibility.

Evidence: `packages/router/README.md`,
`packages/adapter-react-router/README.md`, and
`packages/adapter-tanstack/README.md`.

## Deployment parity

The compiler restricts request context and route data requests to Bun and Node.
Native rendering and Vercel Edge have additional restrictions. Extend one
runtime at a time and test the built artifact on its actual runtime, including
request cancellation, static assets, and data requests. Do not equate a handler
test running on Bun with a deployable Worker or function.

Evidence: `packages/compiler/src/manifest.ts` and
`packages/framework/README.md`.

## Navigation and document metadata

The Next adapter's `refresh()` reloads the document and its `prefetch()` is a
no-op. Native server metadata has no client head manager. A state-preserving
refresh, useful prefetch, and navigation-aware metadata need explicit cache,
invalidation, and ownership semantics rather than isolated API stubs.

Evidence: `packages/adapter-next/src/navigation.ts` and
`packages/framework/README.md`.

## Native server component boundaries

Solid native lazy components and component error boundaries reject SSR. Route
error boundaries already exist. Component-level server fallbacks need defined
error ownership; lazy components also need an async rendering contract.

Evidence: `packages/adapter-solid/src/lazy.ts`,
`packages/adapter-solid/src/flow.ts`, and `packages/server/src/data.ts`.

These priorities reflect source and documentation review, not measured adoption.
