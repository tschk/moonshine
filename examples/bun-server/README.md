# bun-server

Moonshine owns the HTTP stack — **no Next / Vite host**.

```bash
# from monorepo root
bun install
cd examples/bun-server
bun run dev
```

Uses `createMoonshineServer` → `Bun.serve` with a pages map (HTML + JSON + splat routes).

Client UI still lives on Vite + `@tschk/moonshine/react` when you need a SPA (`moonshine new`, `examples/vite-crepus`).
