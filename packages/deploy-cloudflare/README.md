# `@tschk/moonshine-deploy-cloudflare`

Cloudflare Workers deployment adapter for Moonshine.

```ts
import { cloudflareAdapter } from "@tschk/moonshine-deploy-cloudflare";

await cloudflareAdapter.build(manifest, ".moonshine");
```

- Target runtime: `cloudflare`.
- Capabilities: `streaming`, `islands`, `edge`, `revalidation`.
- Output: `server.ts` worker that uses the Cloudflare Cache API and an `ASSETS`
  binding for static files.

Limitations: requires an `ASSETS` binding for static files; worker size and
Cache API limits apply.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
