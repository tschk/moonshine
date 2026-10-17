# `@tschk/moonshine-deploy-node`

Node HTTP deployment adapter for Moonshine.

```ts
import { nodeAdapter, createNodeHandler } from "@tschk/moonshine-deploy-node";

await nodeAdapter.build(manifest, ".moonshine");
```

- Target runtime: `node`.
- Capabilities: `streaming`, `islands`, `revalidation`.
- Output: `server.ts` using `node:http` and a `Request` / `Response` bridge.
- Native builds also emit a bundled `server.js`; deploy it beside `public/` and run
  `node server.js`. The bundle includes its manifest and needs no runtime packages.
  This path is verified on Node 22. Building still requires Bun.

Create an independent native app with `moonshine new app --adapter node`, then
run `bun install`, `bun run build`, and `bun run start`. Native Node supports SSR,
static rendering, and explicit SPA clients; hydration and streaming are unfinished.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
