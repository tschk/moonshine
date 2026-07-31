# moonshine + Next (App Router)

Minimal App Router example:

- `app/page.tsx` — Server Component
- `app/counter.tsx` — Client Component using `@tschk/moonshine-next`

Moonshine does **not** replace the App Router. Import signals only from client files.

```bash
# from monorepo root
bun install
cd examples/next-counter
bun run dev
```

Server helpers (no client hooks):

```ts
import { definePage } from "@tschk/moonshine-next/server";
```
