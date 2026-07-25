# `@tschk/moonshine`

Hyperminimal signal runtime — Bun-first. **No React in the default export.**

```ts
import { createSignal, createMemo, createStore, batch } from "@tschk/moonshine";
import { createApp, useSignal } from "@tschk/moonshine/react";
import { state, derived, effect } from "@tschk/moonshine/runes";
```

Optional subpaths: `./react`, `./runes`, `./router`, `./server`, `./shaders`, `./jsx-runtime`.
