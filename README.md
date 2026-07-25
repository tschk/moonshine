# moonshine

Lightweight **React-first** UI runtime for crepuscularity View IR, plus a Bayer-dither component kit.

Published under the `@tschk/*` scope.

## Packages

| Package | Role |
|---------|------|
| `@tschk/moonshine` | Light core: signals, `createApp`, jsx-runtime |
| `@tschk/crepus-moonshine` | Crepus View IR → React renderer |
| `@tschk/moonshine-components` | 44 catalog components (charts / primitives / motion) |
| `@tschk/moonshine-waku` | Waku client re-exports |
| `@tschk/moonshine-next` | Next.js client re-exports |
| `@tschk/moonshine-solid` | Solid adapter (separate vnode / signal bridge) |
| `@tschk/moonshine-svelte` | Svelte 5 rune-friendly stores |
| `@tschk/moonshine-vue` | Vue 3 ref bridge |
| `@tschk/moonshine-angular` | Angular-like signal bridge |
| `moonshine_jaspr` | Dart: View IR JSON → TypeScript emit |

## Light core — import what you need

```ts
import { createSignal, createApp } from "@tschk/moonshine";
import { MoonshineRouter } from "@tschk/moonshine/router";
import { createMoonshineServer } from "@tschk/moonshine/server";
import { useFragmentShader } from "@tschk/moonshine/shaders";
```

Default export surface stays small. Router, server, and shaders are optional subpaths.

## React frameworks (Waku / Next)

Waku and Next are React. Moonshine works natively — use `"use client"` islands and import from `@tschk/moonshine-waku` or `@tschk/moonshine-next`. No vnode translation.

## Solid is separate

Solid does **not** share a vnode with React. Use `@tschk/moonshine-solid` for a signal bridge and `renderCrepusIrSolid`.

## Crepus → moonshine

`.crepus` compiles to View IR; `@tschk/crepus-moonshine` maps IR kinds to React:

`text`, `stack`, `scroll`, `button`, `toggle`, `checkbox`, `progress`, `meter`, `sparkline`, `badge`, `divider`, `spacer`, `image`, `if`, `forEach`, `list`, `listItem`.

```ts
import { renderCrepusIr, createApp } from "@tschk/crepus-moonshine";

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

## Jaspr

`dart/moonshine_jaspr` lowers View IR JSON to a TypeScript string that imports `@tschk/crepus-moonshine`.

## Components

Top-level `components/` (`@tschk/moonshine-components`): catalog (44), themes, specs, Bayer dither charts, accessible primitives, motion.

## Develop

```bash
bun install
bun test
cd dart/moonshine_jaspr && dart test
```

## License

ISC
