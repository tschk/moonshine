# AGENTS.md — moonshine

## Scope

Moonshine is a Bun-first UI runtime. **Adapters expose each host stack’s real
libraries** (Next navigation/image/link, TanStack Query/Router, Remix react,
Vue/Nuxt/Svelte/Solid runtimes, etc.) plus moonshine signal bridges.

## Rules

1. Default export signal-only. React on `/react`.
2. Adapters must re-export **host libraries on subpaths** (peer deps), not only moonshine.
3. Next: `/navigation`, `/link`, `/image`, `/headers`, `/dynamic`, `/shaders`, `/server`.
4. Remix: `/react` (`@remix-run/react`), `/hooks` (signal bridges).
5. TanStack: `/query`, `/router`.
6. Vue: `/vue`. Svelte: `/store`. Solid: `/solid`, `/h`. Nuxt: `/app`.
7. Next/Remix/TanStack root must not export `MoonshineRouter`.
8. Use ambient `shims.d.ts` so monorepo tests run without installing every host.
9. Greenfield: `moonshine new` (Bun) / `--vite`.
10. Crepus real kinds; catalog canvas real; Bun workspaces.

## Tests

```bash
bun install && bun test && bun run typecheck && bun run typecheck:native
```
