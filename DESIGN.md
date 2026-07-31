# Moonshine design

Hyperminimal, Bun-first UI runtime. Import what you need.

## What we take (and leave)

| Inspiration | Keep | Leave |
|-------------|------|-------|
| **Solid** | Fine-grained signals (`createSignal` / `createMemo` / `createStore`), read-by-call, write via `.set` | Solid JSX / compiler / shared vnode |
| **Svelte** | Approachable sugar in `@tschk/moonshine/runes` (`state`, `derived`, `effect`) | Compiler runes, `.svelte` files |
| **Waku** | Tiny server surface (`./server`), client islands via framework adapters, import-what-you-need subpaths | Full RSC framework |

## Bun as base

- Package manager + test runner + CLI shebang (`#!/usr/bin/env bun`)
- Workspace monorepo; apps author **`.tsx`**
- CLI: `@tschk/moonshine-cli` binary `moonshine` (`new`, `compile`, `dev`, `build`)
- Typecheck: `tsc` (TS 7) + optional/required `tsgo` (native Go port)

## Package surface

```
@tschk/moonshine                 # signals only — NO React
@tschk/moonshine/react           # useSignal, useStore, createApp
@tschk/moonshine/host-react      # shared React-host barrel (adapters)
@tschk/moonshine/runes           # state / derived / effect sugar
@tschk/moonshine/router          # instance router (createMoonshineRouter)
@tschk/moonshine/server
@tschk/moonshine/shaders         # compat → @tschk/moonshine-shaders
@tschk/moonshine/jsx-runtime
@tschk/moonshine-shaders         # WebGL fragment helpers
@tschk/crepus-moonshine          # View IR → React
@tschk/crepus-moonshine/ir       # framework-free IR helpers
@tschk/crepus-moonshine/types
```

Default export is the signal runtime. React is optional (`peerDependenciesMeta.optional`).

## Crepus → TSX

`.crepus` compiles to View IR; moonshine apps consume IR as **`.tsx`**:

1. Prefer `crepus web build --emit moonshine` when `crepus` is on `PATH`
2. Or `moonshine compile view.json` — emit a TSX file that imports `renderCrepusIr` from `@tschk/crepus-moonshine` and mounts via `@tschk/moonshine/react`

React and Solid each own a host renderer. Shared code is IR helpers only (`bindItemTemplate`, sparkline math, badge tones) — not a shared vnode.

## Host adapters

Packages under `packages/adapter-*` so apps import `@tschk/moonshine-<host>`:

| Host | Notes |
|------|--------|
| Next / Remix / TanStack | `@tschk/moonshine/host-react` only — **host owns routing** |
| Astro / Waku | host-react + optional island router + shaders |
| Solid | separate IR renderer via `solid-js/h` + `/ir` helpers |
| Vue / Nuxt / Svelte / Angular-like | native bridges |

Next also exports `@tschk/moonshine-next/server` for RSC-safe server helpers.

## Apps

- `moonshine new <name>` — Vite + React TSX (TypeScript ~7)
- `examples/vite-crepus` — Crepus IR demo
- `examples/catalog-gallery` — components catalog

## Components

Optional. `@tschk/moonshine-components` is a catalog that plugs into moonshine apps. The product is the runtime; the catalog is an add-on.
