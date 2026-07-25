# moonshine

Hyperminimal **Bun-first** signal runtime for crepuscularity View IR, plus a Bayer-dither component kit.

Published under the `@tschk/*` scope. Default `@tschk/moonshine` has **no React dependency** — import `/react` for TSX apps.

## Packages

| Package | Role |
|---------|------|
| `@tschk/moonshine` | Signals only (`createSignal` / `createMemo` / `createStore`) |
| `@tschk/moonshine/react` | `useSignal`, `useStore`, `createApp` |
| `@tschk/moonshine/runes` | Svelte-inspired sugar (`state` / `derived` / `effect`) |
| `@tschk/moonshine-cli` | Bun CLI: `moonshine new\|compile\|dev\|build` |
| `@tschk/crepus-moonshine` | Crepus View IR → React renderer |
| `@tschk/moonshine-components` | 44 catalog components (charts / primitives / motion) |
| `@tschk/moonshine-waku` | Waku client re-exports |
| `@tschk/moonshine-next` | Next.js client re-exports |
| `@tschk/moonshine-solid` | Solid adapter (separate vnode / signal bridge) |
| `@tschk/moonshine-svelte` | Svelte 5 rune-friendly stores |
| `@tschk/moonshine-vue` | Vue 3 ref bridge |
| `@tschk/moonshine-angular` | Angular-like API (no `@angular/core` peer) |
| `moonshine_jaspr` | Dart: View IR JSON → TypeScript emit |

See [DESIGN.md](./DESIGN.md) for Solid / Svelte / Waku influences.

## Import what you need

```ts
import { createSignal, createMemo } from "@tschk/moonshine";
import { createApp, useSignal } from "@tschk/moonshine/react";
import { state, effect } from "@tschk/moonshine/runes";
import { MoonshineRouter } from "@tschk/moonshine/router";
import { createMoonshineServer } from "@tschk/moonshine/server";
import { useFragmentShader } from "@tschk/moonshine/shaders";
```

## CLI

```bash
bun run moonshine -- new my-app
bun run moonshine -- compile view.json   # → view.tsx
bun run moonshine -- dev
```

## Crepus → TSX

`.crepus` compiles to View IR; apps author **`.tsx`**:

```ts
import { createApp } from "@tschk/moonshine/react";
import { renderCrepusIr } from "@tschk/crepus-moonshine";

function App() {
  return renderCrepusIr({
    version: 1,
    root: [
      {
        kind: "stack",
        children: [
          { kind: "text", content: "hello" },
          { kind: "sparkline", values: [1, 3, 2, 5] },
        ],
      },
    ],
  });
}

createApp({ root: App }).mount("#app");
```

## Develop / environment

```bash
./scripts/dev-setup.sh
bun install
bun run check
bun test
cd examples/catalog-gallery && bun run dev
```

```bash
export MOONSHINE_PATH=/path/to/moonshine
bun run moonshine -- new my-app
```

## License

ISC
