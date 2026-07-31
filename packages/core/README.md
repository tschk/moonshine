# `@tschk/moonshine`

Signal-only kernel of the Moonshine framework. Bun-first.

```ts
import { createSignal, createMemo, createStore, batch } from "@tschk/moonshine";
import { createApp, useSignal } from "@tschk/moonshine/react";
import { state, derived, effect } from "@tschk/moonshine/runes";
```

The default export contains only signals, memos, stores, and resources. Router,
server, compiler, and deployment packages are separate imports.

Optional compatibility subpaths (`/react`, `/runes`, `/router`, `/server`,
`/shaders`) remain available during the `0.3.x` line.

See [Moonshine README](../../README.md), [DESIGN.md](../../DESIGN.md), and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
