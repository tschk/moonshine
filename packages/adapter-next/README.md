# @tschk/moonshine-next

Next.js App Router adapter.

- **Client:** `import { createSignal, useSignal } from "@tschk/moonshine-next"` in `"use client"` files.
- **Server:** `import { definePage } from "@tschk/moonshine-next/server"` (no client hooks).
- Does **not** export `MoonshineRouter` — use the App Router.

See `examples/next-counter` (Next **16.2+** if monorepo uses TypeScript 7).

```bash
bun install
cd examples/next-counter && bun run dev
```
