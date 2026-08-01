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

| Detected                                    | How it is adopted                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Next App Router, Next Pages Router          | `next/*` aliased to `@tschk/moonshine-next` through `compilerOptions.paths`             |
| react-router / Remix, TanStack Router, Waku | host specifiers aliased to the matching `@tschk/moonshine-*` adapter                    |
| Svelte, Vue                                 | templates compiled to View IR by crepuscularity and mounted as generated route modules  |
| Vite + React, plain React                   | config and dependencies only; nothing to alias                                          |
| Astro, Angular                              | refused, non-zero, nothing written — crepuscularity has no parser frontend for them yet |

No source file is ever edited. For the aliasing path, every specifier the
adapter implements is remapped through `compilerOptions.paths`, which Bun
honours in both `bun run` and `Bun.build`. For the template path, each `.svelte`
or `.vue` file is parsed by crepuscularity's frontend for that extension into
View IR, and a route module under `moonshine/routes/` renders that IR through
`@tschk/crepus-moonshine`. `moonshine.config.ts` records the route directory and
convention either way.

`<script>` blocks in Svelte and Vue components are **not** executed: runes,
stores, the Composition API and lifecycle hooks do not run, and that logic has to
be ported to moonshine signals. Template constructs the parser does not support
are hard errors reported per file, not silent drops. Because the IR is captured
at adopt time, re-run `moonshine adopt --force` after editing a template.

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
