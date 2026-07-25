# AGENTS.md — moonshine

## Scope

Moonshine is the React-first UI runtime + crepus View IR bridge + dither component kit, published as `@tschk/*`.

## Layout

- `packages/core` → `@tschk/moonshine` (light default: signals + createApp + jsx-runtime)
- `packages/crepus-moonshine` → `@tschk/crepus-moonshine` (full View IR renderer)
- `packages/adapter-*` → framework adapters (Waku/Next = React re-exports; Solid = separate)
- `components/` → `@tschk/moonshine-components` (catalog, themes, specs, charts, primitives, motion)
- `dart/moonshine_jaspr` → IR → TypeScript emit
- `examples/vite-crepus` → Vite demo mounting `renderCrepusIr`

## Rules

1. Keep the core default export **light**. Optional APIs live on subpaths (`./router`, `./server`, `./shaders`).
2. React-first. Do not invent a shared vnode for Solid — use `@tschk/moonshine-solid`.
3. Crepus bridge must render real kinds (not stubs) for the documented IR surface.
4. Charts must paint with Bayer dither canvas (`components/src/dither/dither-paint.ts`), not empty divs.
5. Catalog test must assert 44 named exports matching `components/catalog/components.json`.
6. Package manager: Bun workspaces. `"type": "module"` everywhere.
7. Peer `react` / `react-dom` on React packages.

## Tests

```bash
bun install
bun test
cd dart/moonshine_jaspr && dart test
```

## Emit contract (Jaspr / CLI)

Generated TS should import from `@tschk/crepus-moonshine` and call `renderCrepusIr`.
