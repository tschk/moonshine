# AGENTS.md — moonshine

## Scope

Moonshine is a hyperminimal Bun-first signal runtime + crepus View IR bridge + dither component kit, published as `@tschk/*`.

## Layout

- `packages/core` → `@tschk/moonshine` (signals only; NO React on default export)
- `packages/core` subpaths → `./react`, `./runes`, `./router`, `./server`, `./shaders`, `./jsx-runtime`
- `packages/cli` → `@tschk/moonshine-cli` binary `moonshine`
- `packages/crepus-moonshine` → `@tschk/crepus-moonshine` (full View IR renderer)
- `packages/adapter-*` → framework adapters (Waku/Next = React re-exports; Solid = separate)
- `components/` → `@tschk/moonshine-components` (catalog, themes, specs, charts, primitives, motion)
- `dart/moonshine_jaspr` → IR → TypeScript emit
- `examples/vite-crepus` → Vite demo mounting `renderCrepusIr`

## Rules

1. Keep the **default** export signal-only. React lives on `@tschk/moonshine/react`. Optional APIs on subpaths.
2. Apps author **`.tsx`**. `.crepus` → `.tsx` via `crepus` or `moonshine compile`.
3. Do not invent a shared vnode for Solid — use `@tschk/moonshine-solid`.
4. Crepus bridge must render real kinds (not stubs) for the documented IR surface.
5. Charts must paint with Bayer dither canvas (`components/src/dither/dither-paint.ts`), not empty divs.
6. Catalog test must assert 44 named exports matching `components/catalog/components.json`.
7. Package manager: Bun workspaces. `"type": "module"` everywhere.
8. Peer `react` / `react-dom` are optional on core; required for `/react` and React packages.

## Tests

```bash
bun install
bun test
cd dart/moonshine_jaspr && dart test
```

## Emit contract (Jaspr / CLI)

Generated TS should import `renderCrepusIr` from `@tschk/crepus-moonshine` and `createApp` from `@tschk/moonshine/react`.
