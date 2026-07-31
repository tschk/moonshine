# moonshine

**Hyperminimal Bun-first UI runtime.** Signals at the core. Own your app —
no metaframework required.

```bash
bun run moonshine -- new my-app      # Bun full-stack (default)
bun run moonshine -- new spa --vite  # client SPA only
cd my-app && bun install && bun run dev
```

```ts
import { createSignal, useSignal, createApp } from "@tschk/moonshine/react";

const count = createSignal(0);

function App() {
  const n = useSignal(count);
  return (
    <button type="button" onClick={() => count.set((x) => x + 1)}>
      {n}
    </button>
  );
}

createApp({ root: App }).mount("#app");
```

## Greenfield path

| Layer | Use |
|-------|-----|
| Full-stack | `moonshine new` → Bun `/server` + static + hydrate island |
| Client SPA | `moonshine new --vite` → Vite + `/react` |
| Client routes | `@tschk/moonshine/router` |
| DSL | `.crepus` → IR → `.tsx` via `moonshine compile` |

## Why it’s different

- **Tiny default.** Signals only on `@tschk/moonshine`.
- **Import what you need.** `/react`, `/runes`, `/router`, `/server`, `/shaders`.
- **Bun as the base.** Install, test, CLI, HTTP, static files.
- **Crepus compiles in.** `.crepus` → View IR → `.tsx`.
- **TS 7 + `tsgo`.** Native Go typechecker supported.

## Packages

| Package | Role |
|--------|------|
| `@tschk/moonshine` | Core signals |
| `@tschk/moonshine/react` | `createApp`, `useSignal`, `useStore` |
| `@tschk/moonshine/runes` | `state` / `derived` / `effect` |
| `@tschk/moonshine/router` | Instance client router |
| `@tschk/moonshine/server` | Pages map + `staticDir` + `Bun.serve` |
| `@tschk/moonshine-cli` | `moonshine new\|compile\|dev\|build` |
| `@tschk/crepus-moonshine` | View IR → React |
| `@tschk/moonshine-shaders` | Optional WebGL |
| `@tschk/moonshine-components` | Optional UI catalog |

## Examples

| Path | What |
|------|------|
| `examples/bun-server` | Canonical Bun HTTP + static + hydrate |
| `examples/vite-crepus` | Vite + Crepus IR |
| `examples/catalog-gallery` | Component catalog |

## Optional host bridges

Only if already inside another UI host. Prefer greenfield above.

| Host | Package |
|------|---------|
| Solid | `@tschk/moonshine-solid` |
| Vue / Nuxt | `@tschk/moonshine-vue` / `-nuxt` |
| Svelte | `@tschk/moonshine-svelte` |
| Astro / Waku | `@tschk/moonshine-astro` / `-waku` |

No Next/Remix/TanStack/Angular adapter packages — use `@tschk/moonshine/react` directly if stuck there.

## Develop

```bash
bun install && bun run check && bun run typecheck:native && bun test
```

See [DESIGN.md](./DESIGN.md) · [docs/COMPARE.md](./docs/COMPARE.md).

## License

ISC
