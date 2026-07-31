# AGENTS.md — moonshine

## Scope

Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
signal kernel. The default export of `@tschk/moonshine` stays signal-only;
routing, rendering, server, compiler, and deployment are opt-in packages.

Adapters expose each host stack's real libraries (Next navigation/image/link,
Solid runtime) plus moonshine signal bridges.

## Rules

1. Default export signal-only. React on `/react`.
2. Adapters must re-export **host libraries on subpaths** (peer deps), not only
   moonshine.
3. Next: `/navigation`, `/link`, `/image`, `/headers`, `/dynamic`, `/shaders`,
   `/server`.
4. Solid: `/solid`, `/store`, `/h`.
5. Next root must not export `MoonshineRouter`.
6. Framework packages communicate through `@tschk/moonshine-framework`
   contracts: routes, manifest, renderer, adapter, and config.
7. React, Solid, and Crepus keep independent renderers; no shared vnode.
8. Use ambient `shims.d.ts` so monorepo tests run without installing every
   host.
9. Greenfield: `moonshine new` (Bun) / `--vite`.
10. Crepus real kinds; catalog canvas real; Bun workspaces.

## Tests

```bash
bun install && bun test && bun run typecheck && bun run typecheck:native
```
