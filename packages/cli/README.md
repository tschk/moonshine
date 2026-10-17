# `@tschk/moonshine-cli`

Bun CLI for scaffolding, building, and inspecting Moonshine projects.

```bash
bun packages/cli/bin/moonshine.ts new my-app
bun packages/cli/bin/moonshine.ts build
bun packages/cli/bin/moonshine.ts inspect
bun packages/cli/bin/moonshine.ts preview
```

Commands:

- `adopt [dir] [--dry-run] [--yes|-y] [--force]`
- `new <name> [--native|--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]`
- `build [dir] [--adapter bun|node|cloudflare|vercel]`
- `inspect [path] [--json]`
- `preview [dir] [--port <n>]`
- `dev [dir]`
- `compile <source> [--ssr|--react] [--compiler <path>]`

Native preview runs the bundled server in a fresh Bun child process. Stopping
preview stops that process; dev rebuilds start a new one so Bun's module caches
cannot serve the previous build. Production artifacts continue to run directly.

`new` defaults to the independent Moonshine DOM runtime with Bun SSR and an
explicit SPA entry. `moonshine new app --adapter node` selects Node production
output; build and dev honor the configured adapter, and `bun run start` runs
`node .moonshine/server.js`. Native routes require matching Bun, Node or Cloudflare
runtimes; `--adapter vercel` selects a bundled native Node 22 function under
`.moonshine/.vercel/output`. Native Vercel Edge, caching, request context and
hydration are unsupported. Cloudflare emits a self-contained
worker and `wrangler.jsonc` with an `ASSETS` binding and `nodejs_compat`; run it
with your installed Wrangler. Native Cloudflare caching/revalidation, islands
and request context are unsupported. `--vite` uses the same DOM runtime for a client app.
`--solid` is an alias for this independent native scaffold, including with
`--vite`; it installs no Solid runtime and does not automatically compile authored
Solid source. React and Crepus scaffolds remain explicit legacy options. Project `public/`
files are copied to the build and served at root URLs; symlinks and generated
asset collisions are rejected.

## `adopt`

Run it with no arguments inside the app you want to move. It walks up from the
working directory to the nearest `package.json` that looks like a project, and
detects the framework rather than assuming one.

```bash
cd ~/code/my-app/app/dashboard
moonshine adopt             # finds ~/code/my-app, asks, then applies
moonshine adopt --dry-run   # print the plan, write nothing, never prompt
moonshine adopt --yes       # skip the prompt (CI, scripts)
bun install && moonshine build && moonshine preview
```

Two adoption paths, decided by what it finds:

| Detected                                    | How it is adopted                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Next App Router, Next Pages Router          | `next/*` aliased to `@tschk/moonshine-next` through `compilerOptions.paths`      |
| react-router / Remix, TanStack Router, Waku | host specifiers aliased to the matching `@tschk/moonshine-*` adapter             |
| Svelte, Vue, Astro, Angular                 | templates compiled to View IR by crepuscularity and emitted as generated modules |
| Vite + React, plain React                   | config and dependencies only; nothing to alias                                   |

No source file is ever edited. For the aliasing path, every specifier the
adapter implements is remapped through `compilerOptions.paths`, which Bun
honours in both `bun run` and `Bun.build`. Template adoption delegates to the
external Crepus CLI's `moonshine-ssr` emitter (select it with `--compiler <path>`).
Unchanged `.ssr.ts` components go into `moonshine/components/`; generated `.ts`
route wrappers (reusing existing `.tsx` paths from earlier adoption) go into `moonshine/routes/`. Config selects native SSR and discovers the generated route wrappers. It adds no React renderer or Crepus React bridge dependencies
and preserves the app's existing dependencies. Missing compilers fail before writes. If every discovered template fails emission,
adoption exits nonzero before changing config, dependencies or generated files,
and lists the per-file compiler diagnostics. Partial success still reports failures.

Route wrappers expose only `scope: { params, data }`. Port other state and handlers
explicitly; scripts are not executed. SSR does not bind interactive browser events
or hydrate. Use `moonshine compile` to emit a DOM component and author an explicit
SPA `clientFile` for browser behavior. Review generated forms and accessibility
before replacing the original: accepted markup may lose form/submit semantics;
Vue v-model remains read-only without authored handlers. Verified Vue/Svelte email
fixtures preserve type, explicit name, required, IDs, label associations and
`aria-label`; review other frontend and attribute combinations. Component styles are also limited: Svelte/Vue
`<style>` blocks and scoped CSS are not preserved, and Astro `<style>` blocks can
fail compilation. Port styles to authored CSS imports until Crepus provides a
stylesheet asset contract. Crepus also does not copy referenced images or other
assets; review generated URLs and include assets explicitly in the application build.

Which files each template frontend claims:

| Framework | Files                                            | Routing                                                        |
| --------- | ------------------------------------------------ | -------------------------------------------------------------- |
| Svelte    | `**/*.svelte`                                    | `+page.svelte` under `routes/`                                 |
| Vue       | `**/*.vue`                                       | files under `routes/` or `pages/`                              |
| Astro     | `**/*.astro`                                     | `src/pages/**` (`index.astro` → `/`, `about.astro` → `/about`) |
| Angular   | `**/*.component.html`, `**/*.ng.html`, `**/*.ng` | none — Angular has no file-based routing                       |

Plain `.html` is deliberately not claimed: an `index.html` is left alone.

Only the markup is compiled. Svelte `<script>` blocks, Vue's Composition API,
Astro's `---` frontmatter and the Angular component class are **not** executed —
no runes, stores, lifecycle hooks, imports, data fetching, DI or pipes — and that
logic has to be ported to moonshine signals. Known frontend restrictions include:

- **Astro** rejects any uppercase component tag (`<Layout>` — the frontend
  resolves no modules), `<slot />`, `{...spread}`, `transition:*` and
  `define:vars`. **This matters in practice**: a real Astro app whose pages use
  components will see those pages fail while the component-free ones compile, so
  expect a partial adoption, not a whole-app one.
- **Angular** rejects `<ng-template>`, `<ng-content>`, `*ngSwitch`,
  `[ngStyle]`/`[style.x]`, `#templateRef`, `@switch`, `@defer` and `@empty`.
- **Angular routes nothing.** Every compiled template lands in
  `moonshine/components/` and stays unmounted until you write a route module that
  imports it. Filenames are not guessed into URLs.

Because emission happens at adopt time, re-run `moonshine adopt --force` after
editing a template. The installed Crepus CLI owns frontend support and diagnostics;
there is no WASM or React fallback. Failed recompilation of an existing generated
route aborts adoption before writes. Routes for removed source templates are not
tracked or deleted automatically; review and retire those stale routes explicitly. Emitted TypeScript is syntax-checked before it
is planned. Unsupported IR failures are reported per file; this is not proof that
all accepted markup preserves original application semantics.

### Confirmation

Before writing anything the command prints the exact plan — every file created
or modified, and every key and value it adds — under a full-width yellow warning
bar, then asks. Only `y` / `yes` proceeds. Without a TTY it prints the same plan
in plain text and exits non-zero rather than waiting on a prompt nobody can
answer; pass `--yes` in CI.

The command ends with a scorecard: how many imports it aliased or templates it
compiled, how many source files it rewrote (zero), and a precise list of what it
cannot carry over — middleware, the metadata API, ISR, `next.config` options,
server actions, async server components, image optimization, and component
script logic.

See [DESIGN.md](../../DESIGN.md), [docs/ROUTING.md](../../docs/ROUTING.md),
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), and
[docs/MANIFEST.md](../../docs/MANIFEST.md).

## `compile`

`moonshine compile view.svelte` delegates parsing and lowering to Crepus and writes
`view.dom.ts` for the independent DOM runtime. `--ssr` writes `view.ssr.ts`;
`--react` explicitly selects React source output (`view.react.tsx`) and retains legacy JSON IR
input (`view.tsx`). Native JSON IR generation is unavailable. Supported frontend extensions
are `.crepus`, `.jsx`, `.tsx`, `.csx`, `.svelte`, `.vue`, `.astro`, `.ng` and `.html`.
The command invokes `crepus web build` in an isolated output directory and copies
the generated modules unchanged. Install a Crepus CLI with `moonshine-dom` and
`moonshine-ssr` emit targets, or select a binary with `--compiler <path>`.
The native output is a component, not a mounted application entry: import it and
mount it with the DOM renderer. Template fragments receive expression readers,
writable bindings and event handlers through their explicit scope/handler contract.
Authored JSX/TSX modules preserve their imports, exports, state and closures for
execution by the native runtime. Supported syntax depends on the installed Crepus
compiler; unsupported constructs fail. Compilation does not execute source scripts
or install a host runtime. Compiler failures leave existing output untouched.

For imports above the entry directory, pass `--site <project-root>`; the source
and reachable local modules must stay inside that root. A version 1
`crepus-module-manifest.json` lets the CLI validate and copy the complete JS/TS
graph. Its optional `sourceModule` names the inventoried output when allocation
remaps the source entry, including SFCs beside same-named JavaScript companions.
The entry facade must reference that module; target, path, inventory and import
validation still apply. Older manifests retain their original filename mapping.
Compiler files live under `.moonshine-compiled/<output-name>/<content-hash>/`,
and the public `.dom.ts` or `.ssr.ts` entry re-exports them. Module bytes stay
unchanged. Sources and DOM/SSR targets have separate directories. Publication
switches the public entry only after the graph is ready. Older versions remain
for existing imports; unused versions can be removed when no process uses them.

Template routes whose final segment is `index`, starts with `+`, or ends in
`.data`, `.server` or `.client` use a directory `index.ts` wrapper so Moonshine’s
route filename conventions preserve the URL. Conflicting output paths and stale
flat wrappers at these reserved paths require manual resolution before adoption;
no generated files are deleted automatically.

Without that module manifest, filesystem imports (including reexports and literal
dynamic imports) are rejected instead of discarding companion files. Template
adoption currently accepts single-file emission only. CSS, binary assets and
computed asset expressions still need an upstream asset contract; the JS/TS graph
inventory does not provide one. Bare package imports remain unchanged.
Native output retaining `react`, `react-dom`, `solid-js`, `svelte` or `vue` runtime imports
is rejected, including subpaths and transitive generated modules. The same boundary
covers `@vue/reactivity`, `@vue/runtime-core`, `@vue/runtime-dom`, `@vue/shared` and
`@vue/server-renderer`.
Those host primitives cannot
drive the native renderer. Crepus must lower supported primitives to Moonshine
or report unsupported imports. Type-only declarations are unaffected;
the explicit legacy `--react` target keeps its existing dependency contract.

Native CLI installs do not require React/Solid renderers or Crepus/WASM. Legacy
renderers and the historical WASM frontend probe are optional peers. React and
Crepus scaffolds install their selected renderer explicitly. Legacy
preview resolves that renderer from the application first, then the CLI install;
if absent, its error names the package to install. Native preview uses the
compiled native renderer without loading a host renderer.
