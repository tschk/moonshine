# `@tschk/moonshine-cli`

Bun CLI for scaffolding, building, and inspecting Moonshine projects.

```bash
bun packages/cli/bin/moonshine.ts new my-app
bun packages/cli/bin/moonshine.ts build
bun packages/cli/bin/moonshine.ts inspect
bun packages/cli/bin/moonshine.ts preview
```

Commands:

- `new <name> [--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]`
- `build [dir] [--adapter bun|node|cloudflare|vercel]`
- `inspect [path] [--json]`
- `preview [dir] [--port <n>]`
- `dev [dir]`
- `compile [file]`

See [DESIGN.md](../../DESIGN.md), [docs/ROUTING.md](../../docs/ROUTING.md),
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md), and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
