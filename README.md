# moonshine

**Hyperminimal Bun-first UI runtime.** Signals at the core. Own your app —
no metaframework required.

```ts
import { createSignal, createMemo } from "@tschk/moonshine";
import { createApp, useSignal } from "@tschk/moonshine/react";

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

## Path (greenfield)

| Layer | Use |
|-------|-----|
| Client TSX | Vite + `@tschk/moonshine/react` (`moonshine new`) |
| HTTP | `@tschk/moonshine/server` + `Bun.serve` |
| Client routes | `@tschk/moonshine/router` |
| DSL | `.crepus` → IR → `.tsx` via `moonshine compile` |

```bash
bun run moonshine -- new my-app
cd my-app && bun install && bun run dev
```

Optional host adapters exist if you already sit inside Next/Astro/etc. They are
**not** the product — thin bridges only.

## Why it’s different

- **Tiny default.** `@tschk/moonshine` is signals only.
- **Import what you need.** `/react`, `/runes`, `/router`, `/server`, `/shaders`.
- **Bun as the base.** Install, test, CLI, and HTTP.
- **Crepus compiles in.** `.crepus` → View IR → `.tsx`.
- **TS 7 + native checker.** `tsc` and `tsgo` (Go port).

## Packages

| Package | Role |
|--------|------|
| `@tschk/moonshine` | Core signals |
| `@tschk/moonshine/react` | `createApp`, `useSignal`, `useStore` |
| `@tschk/moonshine/runes` | `state` / `derived` / `effect` |
| `@tschk/moonshine/router` | Instance client router |
| `@tschk/moonshine/server` | Pages map + `Bun.serve` |
| `@tschk/moonshine-cli` | `moonshine new\|compile\|dev\|build` |
| `@tschk/crepus-moonshine` | View IR → React |
| `@tschk/moonshine-shaders` | Optional WebGL (`/shaders` re-exports) |
| `@tschk/moonshine-components` | Optional UI catalog |

## CLI

```bash
bun run moonshine -- new my-app
bun run moonshine -- compile app.crepus
bun run moonshine -- dev
bun run moonshine -- build
```

## Crepus → TSX

```tsx
import { createApp } from "@tschk/moonshine/react";
import { renderCrepusIr } from "@tschk/crepus-moonshine";

export function App() {
  return renderCrepusIr(/* View IR */);
}

createApp({ root: App }).mount("#app");
```

## Examples

| Path | What |
|------|------|
| `examples/bun-server` | **Native** Bun HTTP (`/server`) — no host framework |
| `examples/vite-crepus` | Vite + Crepus IR client |
| `examples/catalog-gallery` | Component catalog |

## Optional host adapters

Only if you already live in another host. Prefer the greenfield path above.

| Host | Package |
|------|---------|
| Astro / Waku | `@tschk/moonshine-astro` / `-waku` |
| Next / Remix / TanStack | thin client bridges (host owns routing) |
| Solid / Svelte / Vue / Nuxt | reactive bridges |
| Angular-like | API shape, no Angular dep |

## Develop

```bash
bun install && bun run check && bun run typecheck:native && bun test
```

See [DESIGN.md](./DESIGN.md). Repo: [`tschk/moonshine`](https://github.com/tschk/moonshine).

## License

ISC
