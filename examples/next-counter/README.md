# moonshine + Next (App Router)

Minimal App Router example:

- `app/page.tsx` — Server Component
- `app/counter.tsx` — Client Component using `@tschk/moonshine-next`

Moonshine does **not** replace the App Router. Import signals only from client files.

Standalone example (not a monorepo workspace — Next/SWC is large).

```bash
cd examples/next-counter
bun install
bun run dev
```

Server helpers (no client hooks):

```ts
import { definePage } from "@tschk/moonshine-next/server";
```
