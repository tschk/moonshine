# AGENTS.md — moonshine

## Scope

Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
signal kernel. The default export of `@tschk/moonshine` stays signal-only;
routing, rendering, server, compiler, and deployment are opt-in packages.

Adapters expose each host stack's real libraries (Next navigation/image/link,
TanStack Query/Router, Remix react, Vue/Nuxt/Svelte/Solid runtimes, etc.) plus
moonshine signal bridges.

## Rules

1. Default export signal-only. React on `/react`.
2. Adapters must re-export **host libraries on subpaths** (peer deps), not only
   moonshine.
3. Next: `/navigation`, `/link`, `/image`, `/headers`, `/dynamic`, `/shaders`,
   `/server`.
4. Remix: `/react` (`@remix-run/react`), `/hooks` (signal bridges).
5. TanStack: `/query`, `/router`.
6. Vue: `/vue`. Svelte: `/store`. Solid: `/solid`, `/h`. Nuxt: `/app`.
7. Next/Remix/TanStack root must not export `MoonshineRouter`.
8. Framework packages communicate through `@tschk/moonshine-framework`
   contracts: routes, manifest, renderer, adapter, and config.
9. React, Solid, and Crepus keep independent renderers; no shared vnode.
10. Use ambient `shims.d.ts` so monorepo tests run without installing every
    host.
11. Greenfield: `moonshine new` (Bun) / `--vite`.
12. Crepus real kinds; catalog canvas real; Bun workspaces.

## Tests

```bash
bun install && bun test && bun run typecheck && bun run typecheck:native
```
