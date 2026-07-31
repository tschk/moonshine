# `@tschk/moonshine-deploy-bun`

Bun deployment adapter for Moonshine.

```ts
import { bunAdapter, createBunServer } from "@tschk/moonshine-deploy-bun";

await bunAdapter.build(manifest, ".moonshine");
```

- Target runtime: `bun`.
- Capabilities: `streaming`, `islands`, `revalidation`.
- Output: `server.ts` using `Bun.serve`, static files from the build directory.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
