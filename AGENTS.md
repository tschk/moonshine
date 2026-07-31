# AGENTS.md — moonshine

## Scope

Moonshine is a hyperminimal Bun-first UI runtime (signals + opt-in imports +
optional host bridges) with an optional component catalog, published as `@tschk/*`.

## Layout

- `packages/core` → `@tschk/moonshine` (signals only; NO React on default export)
- `packages/core` subpaths → `./react`, `./host-react`, `./runes`, `./router`, `./server`, `./shaders`, `./jsx-runtime`
- `packages/shaders` → `@tschk/moonshine-shaders` (core `./shaders` re-exports)
- `packages/cli` → `@tschk/moonshine-cli` binary `moonshine`
- `packages/crepus-moonshine` → View IR → React; `./ir` + `./types` shared helpers
- `packages/adapter-*` → optional bridges: solid, vue, nuxt, svelte, astro, waku
- `components/` → optional `@tschk/moonshine-components`
- `dart/moonshine_jaspr` → IR → TypeScript emit
- `examples/bun-server` → canonical Bun full-stack
- `examples/vite-crepus` · `examples/catalog-gallery`
- `docs/COMPARE.md` → vs other frameworks + audit notes

## Rules

1. Default export signal-only. React on `@tschk/moonshine/react`.
2. Apps author **`.tsx`**. `.crepus` → `.tsx` via `crepus` or `moonshine compile`.
3. No shared vnode for Solid — `@tschk/moonshine-solid` + `/ir` helpers only.
4. Crepus renders real kinds (not stubs) for documented IR surface.
5. Catalog charts use real canvas paint path.
6. Catalog test asserts exports match `components/catalog/components.json`.
7. Package manager: Bun workspaces. `"type": "module"` everywhere.
8. Peer `react` / `react-dom` optional on core; required for `/react`.
9. Greenfield = Bun `/server` (+ static/hydrate) and/or Vite `/react`. **No Next adapter.**
10. Host bridges that own routing must not re-export `MoonshineRouter`.
11. `moonshine new` defaults to `--bun`; SPA via `--vite`.
12. Prefer `typecheck:native` (`tsgo`) alongside `tsc`.

## Tests

```bash
bun install
bun test
bun run typecheck
bun run typecheck:native
cd dart/moonshine_jaspr && dart test
```

## Emit contract (Jaspr / CLI)

Generated TS imports `renderCrepusIr` from `@tschk/crepus-moonshine` and
`createApp` from `@tschk/moonshine/react`.
