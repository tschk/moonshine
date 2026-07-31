# `@tschk/moonshine-cli`

Bun CLI for scaffolding, building, and inspecting Moonshine projects.

```bash
bun packages/cli/bin/moonshine.ts new my-app
bun packages/cli/bin/moonshine.ts build
bun packages/cli/bin/moonshine.ts inspect
bun packages/cli/bin/moonshine.ts preview
```

Commands:

- `adopt [dir] [--dry-run] [--force]`
- `new <name> [--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]`
- `build [dir] [--adapter bun|node|cloudflare|vercel]`
- `inspect [path] [--json]`
- `preview [dir] [--port <n>]`
- `dev [dir]`
- `compile [file]`

## `adopt`

Points at an existing Next app and makes it run on moonshine without `next`
installed. It does not edit your source: every `next/*` specifier the adapter
implements is remapped through `compilerOptions.paths`, which Bun honours in
both `bun run` and `Bun.build`. `moonshine.config.ts` records the route
directory and convention so `moonshine build` reads `app/` or `pages/` in place.

```bash
moonshine adopt --dry-run   # print the plan, write nothing
moonshine adopt             # apply; running twice is a no-op
bun install && moonshine build && moonshine preview
```

The command ends with a scorecard: how many imports it aliased, how many source
files it rewrote, and a precise list of what it cannot carry over — middleware,
the metadata API, ISR, `next.config` options, server actions, async server
components, and image optimization.

See [DESIGN.md](../../DESIGN.md), [docs/ROUTING.md](../../docs/ROUTING.md),
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
