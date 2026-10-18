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

The Node adapter targets Node's HTTP server. Its regression suite also checks
normal body completion and partial-upload cancellation in Bun. Bun 1.3.10's
`node:http` emulation clears abort callbacks after body EOF, so disconnect cancellation
following a completed upload is unsupported in that combination. Use the native
Bun adapter for Bun deployments; completed-upload disconnects are checked in
actual Node. See the [pinned Bun implementation](https://github.com/oven-sh/bun/blob/bun-v1.3.10/src/js/node/_http_incoming.ts).
