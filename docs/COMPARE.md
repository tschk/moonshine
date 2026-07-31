# Moonshine vs other web stacks

Honest map: **what moonshine is**, what it is not, where it wins/loses.

## One-line map

| Stack | One line | Moonshine relation |
|-------|----------|--------------------|
| **Next.js** | Full-stack React metaframework (RSC, App Router) | **Not competing on platform features.** Greenfield = Bun + `/server` + Vite/`--vite`. No Next adapter package. |
| **Remix / RR7** | Nested routes, loaders/actions | Web-fetch spirit; we stay smaller. No dedicated adapter — import `@tschk/moonshine/react`. |
| **Waku** | Minimal React 19 / RSC | Cousin on lightness; optional `-waku` bridge only. |
| **Astro** | Content-first islands | Better content sites; optional `-astro` island bridge. |
| **Solid** | Fine-grained reactive compiler | We take signals, not compiler. `-solid` = IR + bridge. |
| **Svelte/SvelteKit** | Compiler UI + kit | `/runes` naming only; `-svelte` store bridge. |
| **Vue/Nuxt** | Progressive + batteries | `-vue` / `-nuxt` bridges only. |
| **Hono** | Tiny fetch router | Complements HTTP; or use our pages map alone. |
| **Vite + React** | Bundler + library | SPA path via `moonshine new app --vite`. |

## Capability matrix

| Capability | Moonshine | Next 16 | Remix | Waku | SolidStart | Hono |
|------------|-----------|---------|-------|------|------------|------|
| Fine-grained signals | **yes** | no | no | no | Solid yes | n/a |
| React TSX | opt-in `/react` | yes | yes | yes | no | n/a |
| Bun-native HTTP | **`/server` + staticDir** | adapter | adapters | node-ish | adapters | **yes** |
| App/file router | pages map | **yes** | **yes** | yes | yes | manual |
| RSC | **no** | **yes** | partial | **yes** | no | n/a |
| Client router | mini `/router` | App Router | yes | yes | yes | n/a |
| Deploy defaults | DIY | **strong** | many | many | many | many |
| Surface size | **tiny core** | large | medium | small-med | med | tiny |
| Crepus View IR | **yes** | no | no | no | no | no |
| Scaffold | `new --bun\|--vite` | create-next-app | create-remix | — | — | — |

## When pick moonshine

- Solid-like **signals** + optional React, no new JSX compiler.
- **Bun** as install/test/HTTP runtime.
- Interactive UI + simple pages/API — not MDX marketing farm or RSC org platform.
- OK composing auth/DB/deploy yourself.

## When not

- RSC / PPR / image-font pipelines → **Next**.
- Content islands site → **Astro**.
- All-in Solid compiler → **Solid**.
- HTTP-only → **Hono**.

## Architecture

```
moonshine core     = signals
+ /react           = React bindings + createApp
+ /router          = instance client router
+ /server          = pages + staticDir + Bun.serve
+ crepus           = View IR → React/Solid
+ adapters         = optional: solid, vue, nuxt, svelte, astro, waku
```

**Scaffold**

```bash
moonshine new app          # default: Bun full-stack
moonshine new spa --vite   # client SPA only
```

## Audit (ponytail) — applied

| Tag | Item | Status |
|-----|------|--------|
| `delete:` | `@tschk/moonshine-next` | done |
| `restore:` | next/remix/tanstack/angular with **real host APIs** | **done** |
| `native:` | `staticDir` + path guard | done |
| `keep:` | signals, crepus IR, bun-server example | done |
| `yagni:` | auth/DB/RSC in core | skipped (compose) |
| `gap:` | hydrate via `bun build` script | intentional, not a bundler framework |

## Bottom line

Moonshine = **runtime + small batteries**, not an app platform.  
Vs Next: simpler Bun/signals path; no RSC platform.  
Vs Hono: we add UI reactivity.  
Vs Solid/Svelte: ideas without compilers.
