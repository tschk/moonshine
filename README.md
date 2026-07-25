# moonshine

A **hyperminimal** UI runtime for the web — Bun-first, signals at the core, everything else an import.

Moonshine stays small on purpose. You get fine-grained reactivity without adopting a whole metaframework. Bring your own host (Vite, Waku, Next, Astro, Remix, …) through thin re-export packages. Author apps in **`.tsx`**. Compile **`.crepus`** into moonshine when you want a lighter DSL on top.

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
- **Import what you need.** `/react`, `/runes`, `/router`, `/server`, `/shaders` are opt-in. Dead weight stays out of your graph.
- **Bun as the base.** Install, test, and CLI (`moonshine new|compile|dev|build`) all run on Bun.
- **Works with the hosts you already use.** Same mental model across adapters — React islands where the host is React; Vue/Solid bridges where it isn’t.
- **Crepus compiles in.** `.crepus` → View IR → `.tsx` via `crepus web build --emit moonshine` or `moonshine compile`. Crepus stays the DSL compiler; moonshine stays the runtime.

Inspired by Solid’s signals, Svelte’s approachability, and Waku’s lightness — without locking you into those compilers.

## Packages

| Package | Role |
|--------|------|
| `@tschk/moonshine` | Core signals (`createSignal` / `createMemo` / `createStore`) |
| `@tschk/moonshine/react` | `createApp`, `useSignal`, `useStore` for TSX |
| `@tschk/moonshine/runes` | Approachable sugar (`state` / `derived` / `effect`) |
| `@tschk/moonshine/router` | Tiny client router |
| `@tschk/moonshine/server` | Minimal server / page helpers |
| `@tschk/moonshine/shaders` | Optional WebGL fragment helpers |
| `@tschk/moonshine-cli` | Bun CLI |
| `@tschk/crepus-moonshine` | View IR → React tree |

## Host adapters (re-exports)

Pick the package that matches your app. Each re-exports the moonshine surface with host notes (`"use client"`, islands, etc.).

| Host | Package |
|------|---------|
| Waku | `@tschk/moonshine-waku` |
| Next.js | `@tschk/moonshine-next` |
| Astro | `@tschk/moonshine-astro` |
| Remix / React Router | `@tschk/moonshine-remix` |
| TanStack Start | `@tschk/moonshine-tanstack` |
| Solid | `@tschk/moonshine-solid` |
| Svelte | `@tschk/moonshine-svelte` |
| Vue | `@tschk/moonshine-vue` |
| Nuxt | `@tschk/moonshine-nuxt` |
| Angular-like API | `@tschk/moonshine-angular` |

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

Need UI beyond the runtime? `@tschk/moonshine-components` is a separate catalog of charts, primitives, and motion pieces that plug into the same themes and apps — useful when you want polished building blocks without inventing them. Most of moonshine is the framework; the catalog is there when you want it.

```ts
import { Sparkline, Button } from "@tschk/moonshine-components";
```

## Develop

```bash
./scripts/dev-setup.sh
bun install && bun run check && bun test
```

See [DESIGN.md](./DESIGN.md) for architecture notes. Repo: [`~/projects/moonshine`](https://github.com/tschk/moonshine).

## License

ISC
