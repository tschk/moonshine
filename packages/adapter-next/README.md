# @tschk/moonshine-next

Next.js App Router adapter.

- **Client:** `import { createSignal, useSignal } from "@tschk/moonshine-next"` in `"use client"` files.
- **Server:** `import { definePage } from "@tschk/moonshine-next/server"` (no client hooks).
- Does **not** export `MoonshineRouter` — use the App Router.

See `examples/next-counter`.
