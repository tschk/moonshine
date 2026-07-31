# `@tschk/moonshine-react`

React renderer, islands, hydration, and signal hooks for Moonshine.

```ts
import { createApp, useSignal, createSignal } from "@tschk/moonshine-react";
import { island, hydrateIslands } from "@tschk/moonshine-react";
```

Features:

- `reactRenderer` implements the `Renderer` contract for SSR and streaming.
- `island` / `hydrateIslands` for partial hydration.
- `createApp`, `useSignal`, `useResource`, `createIslandSignal`.
- `serializeIslandProps` for server island props.

Peer dependencies: `react` and `react-dom` >= 18.

See [docs/MANIFEST.md](../../docs/MANIFEST.md) and
[DESIGN.md](../../DESIGN.md).
