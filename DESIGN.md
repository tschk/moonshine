# Moonshine design

Hyperminimal, Bun-first UI runtime. **Moonshine is the app stack** — signals,
optional React TSX, client router, Bun HTTP + static. Host bridges are escapes.

## What we take (and leave)

| Inspiration | Keep                          | Leave                   |
| ----------- | ----------------------------- | ----------------------- |
| **Solid**   | Signals, read-by-call, `.set` | Compiler / shared vnode |
| **Svelte**  | `/runes` sugar                | `.svelte` compiler      |
| **Waku**    | Tiny `/server` pages map      | Full RSC framework      |

## Bun as base

- Install + test + CLI + `Bun.serve` + static files
- Scaffold: `moonshine new` (bun full-stack) or `--vite` SPA
- Typecheck: `tsc` + `tsgo` (Go native port)

## Package surface

```
@tschk/moonshine            # signals
@tschk/moonshine/react
@tschk/moonshine/host-react # shared barrel for remaining bridges
@tschk/moonshine/runes
@tschk/moonshine/router     # createMoonshineRouter
@tschk/moonshine/server     # pages + staticDir + Bun.serve
@tschk/moonshine/shaders
@tschk/crepus-moonshine     # IR → React (+ ./ir)
```

## Greenfield

1. **Full-stack:** `moonshine new app` → server + `public/` + client hydrate
2. **SPA:** `moonshine new app --vite`
3. **Crepus:** `moonshine compile`

Bridges kept: solid, vue, nuxt, svelte, astro, waku.  
Removed: next, remix, tanstack, angular (use core or YAGNI).

Vs others: [`docs/COMPARE.md`](./docs/COMPARE.md).

## Crepus IR

React and Solid own renderers. Shared = IR helpers only — not a vnode.

## Components

Optional `@tschk/moonshine-components`.
