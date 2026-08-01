# moonshine.tsc.hk

The moonshine showcase, built on moonshine and served from a Cloudflare Worker.

```bash
bun run build      # moonshine build --adapter cloudflare, then client + worker bundles
bunx wrangler dev  # local worker
bun run deploy     # build + wrangler deploy
```

- `src/routes/` — file-system routes; the compiler classifies each one.
- `src/renderer.tsx` — the site's own `Renderer`, because `reactRenderer` emits a
  fixed document shell with no `<head>` hook.
- `src/worker.ts` — Cloudflare entry with a static route-module map.
- `src/islands/graph.tsx` — the hydrated signal-graph island.
