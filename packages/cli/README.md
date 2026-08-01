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
- `new <name> [--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]`
- `build [dir] [--adapter bun|node|cloudflare|vercel]`
- `inspect [path] [--json]`
- `preview [dir] [--port <n>]`
- `dev [dir]`
- `compile [file]`

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
honours in both `bun run` and `Bun.build`. For the template path, each file is
parsed by the crepuscularity frontend its filename selects into View IR, and a
module renders that IR through `@tschk/crepus-moonshine`:
`moonshine/routes/` for templates that map to a URL, `moonshine/components/` for
templates that do not. `moonshine.config.ts` records the route directory and
convention either way.

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
logic has to be ported to moonshine signals. Template constructs the parser does
not support are hard errors reported per file, not silent drops:

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

Because the IR is captured at adopt time, re-run `moonshine adopt --force` after
editing a template.

The `.astro` and Angular frontends landed in crepuscularity after
`@tschk/crepuscularity-wasm@0.1.2`. `adopt` probes the installed parser build
before touching anything and refuses, non-zero and without writing, when the
frontend is missing — the dispatcher's fallback to generic markup is silent, and
adopting against it would produce quietly wrong pages.

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
