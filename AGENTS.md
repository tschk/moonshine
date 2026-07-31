# AGENTS.md — moonshine

## Scope

Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
signal kernel. The default export of `@tschk/moonshine` stays signal-only;
routing, rendering, server, compiler, and deployment are opt-in packages.

There are two kinds of adapter:

- **Reimplementing** (`adapter-next`, `adapter-react-router`,
  `adapter-tanstack`, `adapter-waku`): the host's API surface rewritten on
  moonshine's router + React. These import nothing from the host and must not
  list it as a dependency or peerDependency — an app aliases the host specifier
  onto the adapter and drops the host entirely. Only possible where the host's
  public API is ordinary React.
- **Hosting** (`adapter-solid`): the host's real runtime re-exported on
  subpaths as a peer dependency, plus moonshine signal bridges. Required
  wherever the host's component format is compiled (Svelte, Vue, Angular,
  `.astro`), which moonshine cannot replace.

## Rules

1. Default export signal-only. React on `/react`.
2. Reimplementing adapters must not import or depend on the host they replace,
   and ship an `/aliases` module mapping the host's specifiers onto their own
   subpaths. Hosting adapters re-export **host libraries on subpaths** (peer
   deps), not only moonshine.
3. Next: `/navigation`, `/link`, `/image`, `/headers`, `/dynamic`, `/shaders`,
   `/server`.
4. Solid: `/solid`, `/store`, `/h`.
5. Next root must not export `MoonshineRouter`.
6. Framework packages communicate through `@tschk/moonshine-framework`
   contracts: routes, manifest, renderer, adapter, and config.
7. React, Solid, and Crepus keep independent renderers; no shared vnode.
8. Hosting adapters use ambient `shims.d.ts` so monorepo tests run without
   installing every host.
9. Greenfield: `moonshine new` (Bun) / `--vite`.
10. Crepus real kinds; catalog canvas real; Bun workspaces.

## Tests

```bash
bun install && bun test && bun run typecheck && bun run typecheck:native
```
