# bun-server

Moonshine owns the stack — **no Next / Vite host**.

| Piece              | How                                                   |
| ------------------ | ----------------------------------------------------- |
| HTML/API routes    | `createMoonshineServer` pages map                     |
| Static CSS/JS      | `staticDir: public/`                                  |
| Interactive island | `src/client.tsx` → `bun build` → `/client.js` hydrate |

```bash
# monorepo root
bun install
cd examples/bun-server
bun run dev
# → http://localhost:3000
```

For an SPA-only Vite project instead, scaffold with `moonshine new --vite`.
