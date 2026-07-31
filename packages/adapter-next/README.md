# @tschk/moonshine-next

Optional thin bridge if an app still runs on Next.js App Router.

Moonshine is the runtime — not a Next replacement layer. Prefer Vite +
`@tschk/moonshine/react` for greenfield apps (`moonshine new`, `examples/vite-crepus`).

If you must stay on Next:

- **Client:** `import { createSignal, useSignal } from "@tschk/moonshine-next"` in `"use client"` files
- **Server:** `import { definePage } from "@tschk/moonshine-next/server"`
- Does **not** export `MoonshineRouter` — App Router owns routing
- TypeScript 7 needs Next **16.2+**
