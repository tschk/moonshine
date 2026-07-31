# `@tschk/moonshine-deploy-node`

Node HTTP deployment adapter for Moonshine.

```ts
import { nodeAdapter, createNodeHandler } from "@tschk/moonshine-deploy-node";

await nodeAdapter.build(manifest, ".moonshine");
```

- Target runtime: `node`.
- Capabilities: `streaming`, `islands`, `revalidation`.
- Output: `server.ts` using `node:http` and a `Request` / `Response` bridge.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
