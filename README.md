# moonshine

A **hyperminimal** UI runtime for the web — Bun-first, signals at the core, everything else an import.

Moonshine stays small on purpose. You get fine-grained reactivity without adopting a whole metaframework. Bring your own host (Vite, Waku, Next, Astro, Remix, …) through thin adapter packages. Author apps in **`.tsx`**. Compile **`.crepus`** into moonshine when you want a lighter DSL on top.

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

## Why it’s different

- **Tiny default.** `@tschk/moonshine` is signals only — no React, no router, no bundler opinion in the core.
- **Import what you need.** `/react`, `/host-react`, `/runes`, `/router`, `/server`, `/shaders` are opt-in.
- **Bun as the base.** Install, test, and CLI (`moonshine new|compile|dev|build`) all run on Bun.
- **Works with the hosts you already use.** React islands where the host is React; Vue/Solid bridges where it isn’t.
- **Crepus compiles in.** `.crepus` → View IR → `.tsx` via `crepus` or `moonshine compile`.
- **TS 7 + native checker.** `bun run typecheck` (`tsc`) and `bun run typecheck:native` (`tsgo`, Go port).

Inspired by Solid’s signals, Svelte’s approachability, and Waku’s lightness — without locking you into those compilers.

## Packages

| Package | Role |
|--------|------|
| `@tschk/moonshine` | Core signals (`createSignal` / `createMemo` / `createStore`) |
| `@tschk/moonshine/react` | `createApp`, `useSignal`, `useStore` for TSX |
| `@tschk/moonshine/host-react` | Shared React-host barrel used by adapters |
| `@tschk/moonshine/runes` | Approachable sugar (`state` / `derived` / `effect`) |
| `@tschk/moonshine/router` | Instance client router (`createMoonshineRouter`) |
| `@tschk/moonshine/server` | Minimal server / page helpers |
| `@tschk/moonshine/shaders` | Compat re-export of WebGL helpers |
| `@tschk/moonshine-shaders` | Optional WebGL fragment helpers |
| `@tschk/moonshine-cli` | Bun CLI |
| `@tschk/crepus-moonshine` | View IR → React tree (`./ir` helpers shared) |

## Host adapters

| Host | Package | Notes |
|------|---------|--------|
| Waku | `@tschk/moonshine-waku` | islands + optional router/shaders |
| Next.js | `@tschk/moonshine-next` | client signals; `./server` for RSC-safe helpers; **no** MoonshineRouter |
| Astro | `@tschk/moonshine-astro` | islands + optional router/shaders |
| Remix / React Router | `@tschk/moonshine-remix` | client signals; host owns routing |
| TanStack Start | `@tschk/moonshine-tanstack` | client signals; host owns routing |
| Solid | `@tschk/moonshine-solid` | separate IR renderer (`renderCrepusIrSolid`) |
| Svelte | `@tschk/moonshine-svelte` | store bridge |
| Vue | `@tschk/moonshine-vue` | `ref` / `computed` bridge |
| Nuxt | `@tschk/moonshine-nuxt` | Vue bridge + `useMoonshineRef` aliases |
| Angular-like API | `@tschk/moonshine-angular` | `signal` / `computed` shape, no Angular dep |

```tsx
// Next App Router — Client Component only
"use client";
import { createSignal, useSignal } from "@tschk/moonshine-next";
```

```tsx
// Astro client island
"use client";
import { createSignal, useSignal } from "@tschk/moonshine-astro";
```

## CLI

```bash
bun run moonshine -- new my-app
bun run moonshine -- compile app.crepus   # → .tsx
bun run moonshine -- dev
bun run moonshine -- build
```

## Crepus → TSX

```bash
crepus web build --emit moonshine
# or
moonshine compile view.json
```

```tsx
import { createApp } from "@tschk/moonshine/react";
import { renderCrepusIr } from "@tschk/crepus-moonshine";

export function App() {
  return renderCrepusIr(/* View IR */);
}

createApp({ root: App }).mount("#app");
```

## Components (optional)

Need UI beyond the runtime? `@tschk/moonshine-components` is a separate catalog of charts, primitives, and motion pieces.

```ts
import { Sparkline, Button } from "@tschk/moonshine-components";
```

## Examples

| Path | What |
|------|------|
| `examples/vite-crepus` | Vite + Crepus IR |
| `examples/catalog-gallery` | Component catalog |
| `examples/next-counter` | Next App Router client island (standalone `bun install` in that folder) |

## Develop

```bash
./scripts/dev-setup.sh
bun install && bun run check && bun run typecheck:native && bun test
```

See [DESIGN.md](./DESIGN.md) for architecture notes. Repo: [`tschk/moonshine`](https://github.com/tschk/moonshine).

## License

ISC
