# Moonshine design

Hyperminimal, Bun-first UI runtime. Import what you need.

## What we take (and leave)

| Inspiration | Keep | Leave |
|-------------|------|-------|
| **Solid** | Fine-grained signals (`createSignal` / `createMemo` / `createStore`), read-by-call, write via `.set` | Solid JSX / compiler / vnode |
| **Svelte** | Approachable sugar in `@tschk/moonshine/runes` (`state`, `derived`, `effect`) | Compiler runes, `.svelte` files |
| **Waku** | Tiny server surface (`./server`), client islands via framework adapters, import-what-you-need subpaths | Full RSC framework |

## Bun as base

- Package manager + test runner + CLI shebang (`#!/usr/bin/env bun`)
- Workspace monorepo; apps author **`.tsx`**
- CLI: `@tschk/moonshine-cli` binary `moonshine` (`new`, `compile`, `dev`, `build`)

## Package surface

```
@tschk/moonshine            # signals only — NO React
@tschk/moonshine/react      # useSignal, useStore, createApp
@tschk/moonshine/runes      # state / derived / effect sugar
@tschk/moonshine/router
@tschk/moonshine/server
@tschk/moonshine/shaders
@tschk/moonshine/jsx-runtime
```

Default export is the signal runtime. React is optional (`peerDependenciesMeta.optional`).

## Crepus → TSX

`.crepus` compiles to View IR; moonshine apps consume IR as **`.tsx`**:

1. Prefer `crepus web build --emit moonshine` when `crepus` is on `PATH`
2. Or `moonshine compile view.json` — emit a TSX file that imports `renderCrepusIr` from `@tschk/crepus-moonshine` and mounts via `@tschk/moonshine/react`

## Host adapters

Thin re-export packages so apps import `@tschk/moonshine-<host>` instead of remembering subpaths:

Waku, Next, Astro, Remix, TanStack, Solid, Svelte, Vue, Nuxt, Angular-like.

React hosts (`"use client"` / islands) share the same re-export shape. Vue/Nuxt and Solid use their bridges. Core stays framework-free.

## Apps

Scaffold with `moonshine new <name>` — Vite + React TSX, deps on `@tschk/moonshine` + `@tschk/crepus-moonshine`, entry imports from `@tschk/moonshine/react`.

## Components

Optional. `@tschk/moonshine-components` is a catalog that plugs into moonshine apps. The product is the runtime; the catalog is an add-on.
