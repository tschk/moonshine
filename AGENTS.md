# AGENTS.md — moonshine

## Scope

Moonshine is a hyperminimal Bun-first UI runtime (signals + opt-in imports + host adapters) with an optional component catalog, published as `@tschk/*`.

## Layout

- `packages/core` → `@tschk/moonshine` (signals only; NO React on default export)
- `packages/core` subpaths → `./react`, `./host-react`, `./runes`, `./router`, `./server`, `./shaders`, `./jsx-runtime`
- `packages/shaders` → `@tschk/moonshine-shaders` (WebGL helpers; core `./shaders` re-exports)
- `packages/cli` → `@tschk/moonshine-cli` binary `moonshine`
- `packages/crepus-moonshine` → `@tschk/crepus-moonshine` (View IR → React; `./ir` + `./types` shared helpers)
- `packages/adapter-*` → host packages (astro, next, waku, remix, tanstack, solid, svelte, vue, nuxt, angular, …)
- `components/` → optional `@tschk/moonshine-components` catalog
- `dart/moonshine_jaspr` → IR → TypeScript emit
- `examples/vite-crepus` → Vite demo mounting `renderCrepusIr`
- `examples/catalog-gallery` → optional components catalog demo

## Rules

1. Keep the **default** export signal-only. React lives on `@tschk/moonshine/react`. Optional APIs on subpaths.
2. Apps author **`.tsx`**. `.crepus` → `.tsx` via `crepus` or `moonshine compile`.
3. Do not invent a shared vnode for Solid — use `@tschk/moonshine-solid`. Share IR **helpers** via `@tschk/crepus-moonshine/ir` only.
4. Crepus bridge must render real kinds (not stubs) for the documented IR surface.
5. Component catalog charts must use the real canvas paint path (not empty placeholders).
6. Catalog test must assert named exports match `components/catalog/components.json`.
7. Package manager: Bun workspaces. `"type": "module"` everywhere.
8. Peer `react` / `react-dom` are optional on core; required for `/react` and React packages.
9. React host adapters that own routing (Next, Remix, TanStack) must **not** re-export `MoonshineRouter`. Use `@tschk/moonshine/host-react`.
10. Prefer native TypeScript Go checker (`bun run typecheck:native` / `tsgo`) alongside `tsc`.

## Tests

```bash
bun install
bun test
bun run typecheck
bun run typecheck:native
cd dart/moonshine_jaspr && dart test
```

## Emit contract (Jaspr / CLI)

Generated TS should import `renderCrepusIr` from `@tschk/crepus-moonshine` and `createApp` from `@tschk/moonshine/react`.
