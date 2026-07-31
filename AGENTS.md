# AGENTS.md — moonshine

## Scope

Moonshine is a hyperminimal Bun-first UI runtime with optional **real** host
adapters (`@tschk/moonshine-*`), published as `@tschk/*`.

## Layout

- `packages/core` — signals, `createResource`, `/react`, `/server`, `/router`, …
- `packages/adapter-next|remix|tanstack|angular|solid|vue|nuxt|svelte|astro|waku`
- `packages/crepus-moonshine` — View IR (+ `./ir` helpers)
- `packages/cli` — `moonshine new --bun|--vite`
- `examples/bun-server` — canonical full-stack
- `docs/COMPARE.md` — framework comparison

## Rules

1. Default export signal-only. React on `/react`.
2. Adapters expose **host-shaped real APIs** (not bare re-export only).
3. Next/Remix/TanStack adapters must **not** re-export `MoonshineRouter`.
4. Next splits `./client` and `./server`.
5. Solid: no shared vnode; use IR helpers from crepus `/ir`.
6. Crepus kinds real (not stubs). Catalog canvas real.
7. Bun workspaces, `"type": "module"`.
8. Greenfield = Bun `/server` and/or Vite `/react`.
9. `moonshine new` defaults to `--bun`.
10. `tsc` + `tsgo` typecheck.

## Tests

```bash
bun install && bun test && bun run typecheck && bun run typecheck:native
```
