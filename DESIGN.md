# Moonshine design

Hyperminimal, Bun-first UI runtime. **Moonshine is the app stack** — signals,
optional React TSX, client router, Bun HTTP. Host adapters are escape hatches.

## What we take (and leave)

| Inspiration | Keep | Leave |
|-------------|------|-------|
| **Solid** | Fine-grained signals, read-by-call, write via `.set` | Solid JSX / compiler / shared vnode |
| **Svelte** | `/runes` sugar (`state`, `derived`, `effect`) | Compiler runes, `.svelte` files |
| **Waku** | Tiny `/server` pages map, import-what-you-need | Full RSC metaframework |

## Bun as base

- Package manager + test + CLI + `Bun.serve`
- Apps author **`.tsx`** (Vite) or HTML/JSON pages via `/server`
- Typecheck: `tsc` (TS 7) + `tsgo` (native Go port)

## Package surface

```
@tschk/moonshine                 # signals only — NO React
@tschk/moonshine/react           # useSignal, useStore, createApp
@tschk/moonshine/host-react      # shared barrel for optional host adapters
@tschk/moonshine/runes
@tschk/moonshine/router          # createMoonshineRouter (instance)
@tschk/moonshine/server          # pages map + Bun.serve
@tschk/moonshine/shaders         # compat → @tschk/moonshine-shaders
@tschk/moonshine/jsx-runtime
@tschk/crepus-moonshine          # View IR → React (+ ./ir helpers)
```

## Greenfield apps

1. **Client:** `moonshine new` → Vite + `@tschk/moonshine/react`
2. **HTTP:** `createMoonshineServer` (see `examples/bun-server`)
3. **Crepus:** `moonshine compile` / `crepus web build --emit moonshine`

Host packages (`adapter-*`) only when embedding moonshine signals inside an
existing Next/Astro/Solid/… app. They do not define the product.

## Crepus IR

React and Solid each own a host renderer. Shared code is IR helpers only
(`@tschk/crepus-moonshine/ir`) — not a shared vnode.

## Components

Optional catalog: `@tschk/moonshine-components`.
