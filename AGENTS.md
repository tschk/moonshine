# AGENTS.md — moonshine

## Scope

Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
signal kernel. The default export of `@tschk/moonshine` stays signal-only;
routing, rendering, server, compiler, and deployment are opt-in packages.

Target architecture: independently replace host frameworks, rather than retain
their runtimes behind re-exports. Keep the signal kernel dependency-free and
all web capabilities opt-in. Source-language parsing and lowering belong in
Crepuscularity; Moonshine owns web routing, rendering, hydration, data loading,
actions, and deployment. Do not duplicate component-language parsers here.

The current tree contains four kinds of adapter during this transition:

- **Reimplementing** (`adapter-next`, `adapter-react-router`,
  `adapter-tanstack`, `adapter-waku`): the host's API surface rewritten on
  moonshine's router + React. These import nothing from the host and must not
  list it as a dependency or peerDependency — an app aliases the host specifier
  onto the adapter and drops the host entirely. Only possible where the host's
  public API is ordinary React.
- **Native source API replacement** (`adapter-solid`, `adapter-svelte`): supported APIs use
  Moonshine's independent graph and DOM/SSR factories, without host runtime
  dependencies. Svelte stores use the independent store protocol. Recompile authored components through Crepus; Solid compiler
  instructions, hydration and async SSR are unsupported. Native source-level
  keyed Show/Match are supported independently.
  Server components use the explicit `/ssr` factory. Do not claim a drop-in
  alias for arbitrary precompiled applications. Crepus supports a bounded Svelte
  source slice (ordinary deep state, snapshots, derived values, post-DOM effects,
  live/destructured props, events, imported children and reactive component selection); full coverage is tracked
  in `docs/native-sfc-coverage.md`. Native
  component contexts/events do not implement Svelte's compiled component ABI.
- **Native composition with legacy entries** (`adapter-vue`): root bridges and
  `/reactive` use only Moonshine core/DOM. `/vue` and `/compiler-sfc` retain an
  optional Vue peer for real host reexports. Native refs/computed/reactive/sync
  watch do not implement Vue's VNode/compiler ABI or full SFC script lowering.
  The optional framework peer is loaded only by the lazy native SSR facade.
- **Native roots with hosting subpaths** (`adapter-angular`, `adapter-astro`, `adapter-nuxt`):
  root signal bridges and the lazy native source renderer do not load the host,
  React or parser WASM. Explicit legacy subpaths re-export host APIs as optional
  peers. These are incomplete replacements: remove remaining host dependencies
  only as independent compiler/runtime behavior is implemented and verified.
  Compiled component formats require a Crepuscularity compiler contract; do not
  alias a partial implementation over unsupported host compiler instructions.

## Rules

1. Default export signal-only. React on `/react`.
2. Reimplementing adapters must not import or depend on the host they replace,
   and ship an `/aliases` module mapping the host's specifiers onto their own
   supported subpaths. Existing hosting subpaths remain explicitly documented
   until replaced; new replacement APIs must be host-free and opt-in.
3. Next: `/navigation`, `/link`, `/image`, `/headers`, `/dynamic`, `/shaders`,
   `/server`.
4. Solid: `/solid`, `/store`, `/h`. Svelte: `/svelte`, `/store`. Vue:
   `/reactive` (native), `/vue`, `/compiler-sfc` (legacy host). Angular: `/core`, `/common`. Astro: `/compiler`.
   Nuxt: `/app`, `/vue`.
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
