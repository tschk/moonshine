# `@tschk/moonshine-cli`

Bun CLI for moonshine.

```bash
bun packages/cli/bin/moonshine.ts new my-app
# or from monorepo root:
bun run moonshine -- new my-app
```

## Commands

| Command | What |
|---------|------|
| `moonshine new <name>` | Scaffold Vite + React TSX app using `@tschk/moonshine/react` |
| `moonshine compile [file]` | `.crepus` → TSX via `crepus`, or View IR `.json` → `.tsx` |
| `moonshine dev` | `bunx vite` |
| `moonshine build` | `bunx vite build` |

When `MOONSHINE_PATH` is set (or the monorepo root is detected), `new` links packages with `file:` deps.
