# Moonshine vs other web stacks

Ponytail read: **what moonshine is**, what it is not, where it wins/loses.

## One-line map

| Stack | One line | Moonshine relation |
|-------|----------|--------------------|
| **Next.js** | Full-stack React metaframework (RSC, App Router, deploy graph) | **Not competing on features.** We replace the *need* for Next on greenfield Bun apps. Optional thin adapters deleted for Next — use core `/react` + `/server`. |
| **Remix / RR7** | Nested routes, loaders/actions as web primitives | Closer in “web fetch” spirit; we stay smaller, no nested route framework. |
| **Waku** | Minimal React 19 / RSC framework | Spiritual cousin on lightness; we drop RSC complexity, keep signals + Bun pages. |
| **Astro** | Content-first, islands | Better for content sites; moonshine is app/runtime + optional catalog. |
| **Solid** | Fine-grained reactive UI compiler | We take signal model, not compiler/JSX. Solid adapter is IR/host bridge only. |
| **Svelte/SvelteKit** | Compiler UI + kit full-stack | `/runes` is naming sugar only — no `.svelte` compiler. |
| **Vue/Nuxt** | Progressive + batteries | Bridges only; not a Vue framework. |
| **Hono** | Tiny fetch router on Web Standards | Complements us: Hono can front HTTP; we own signals/UI. Or use our `/server` pages map alone. |
| **Vite + React** | Bundler + library | **Default client path** (`moonshine new`). We add signals, router, Bun server, crepus. |

## Capability matrix (honest)

| Capability | Moonshine | Next 16 | Remix | Waku | SolidStart | Hono |
|------------|-----------|---------|-------|------|------------|------|
| Fine-grained signals | **yes** (core) | no (React state) | no | no | Solid yes | n/a |
| React TSX apps | opt-in `/react` | yes | yes | yes | no | n/a |
| Bun-native HTTP | **`/server` + staticDir** | via adapter | adapters | node-ish | adapters | **yes** |
| File/App Router | pages map (manual) | **yes** | **yes** | yes | yes | manual |
| RSC / server components | **no** | **yes** | partial | **yes** | no | n/a |
| Client router | mini `/router` | App Router | yes | yes | yes | n/a |
| Deploy story | DIY Bun/Node | **Vercel-class** | many | many | many | many |
| Bundle size / surface | **tiny core** | large | medium | small-med | med | tiny |
| DSL (Crepus IR) | **yes** | no | no | no | no | no |
| UI catalog | optional components | ecosystem | ecosystem | ecosystem | ecosystem | n/a |

## When pick moonshine

- Want **Solid-like signals** with optional React, not a new JSX compiler.
- Want **Bun as runtime + HTTP**, not a cloud-tied metaframework.
- App is interactive UI + simple pages/API — not marketing MDX farm (use Astro) or huge RSC org (use Next).
- OK owning deploy/auth/ORM yourself (or bolt Hono/Drizzle/etc.).

## When not

- Need RSC, partial prerender, image/font pipelines, org defaults → **Next**.
- Content site with islands → **Astro**.
- Already all-in Solid compiler → **Solid** (optionally moonshine IR only).
- Only need HTTP router → **Hono** (skip us unless UI signals matter).

## Architectural stance

```
moonshine core     = signals
+ /react           = React bindings + createApp
+ /router          = small client router (instance-based)
+ /server          = pages map + staticDir + Bun.serve
+ crepus           = View IR → React/Solid renderers
+ adapters-*       = optional foreign-host bridges (not product center)
```

**Next is not the host we build for.** Greenfield = Vite client and/or Bun server.

## Size / complexity (this repo, approx)

| Area | Role | Notes |
|------|------|-------|
| `packages/core` | product | ~1.2k LOC signals/react/router/server |
| `crepus-moonshine` | IR | shared `./ir` helpers; React renderer |
| `adapter-*` | optional | many are thin re-exports |
| `components` | optional catalog | largest surface |
| `examples/bun-server` | **canonical full-stack demo** | static + hydrate + API |

## Audit snapshot (ponytail)

`delete:` `@tschk/moonshine-next` — removed; contradicts “replace Next” product story.  
`yagni:` more React host adapters (remix/tanstack) stay as ~10-line bridges or cut later if unused.  
`shrink:` pages map is enough until real file-router demand.  
`native:` static files via Bun.file + path guard — done in `/server`.  
`gap:` no auth, no DB, no RSC, no image optimizer — **by design**; compose.  
`gap:` client hydrate needs `bun build` step (example scripts) — not a full bundler framework.  
`keep:` signals engine quality (pull memos, stores, batch).  
`keep:` crepus IR dual host without shared vnode.

## Bottom line

Moonshine is a **runtime + small batteries**, not an app platform.  
Vs Next: win on simplicity/Bun/signals; lose on full-stack defaults and RSC.  
Vs Hono: we add UI reactivity; they stay better pure HTTP toolkit.  
Vs Solid/Svelte: we borrow ideas without taking compilers.
