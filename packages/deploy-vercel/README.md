# `@tschk/moonshine-deploy-vercel`

Vercel deployment adapter for Moonshine.

```ts
import { vercelAdapter } from "@tschk/moonshine-deploy-vercel";

await vercelAdapter.build(manifest, ".moonshine");
```

- Target runtimes: `node`, `vercel-edge`.
- Capabilities: `streaming`, `islands`, `edge`.
- Output: `.vercel/output` with static HTML, function directories, and
  `config.json` route regexes.

Limitations: static catch-all routes are not pre-rendered; each non-static
route becomes a separate function; `revalidation` is not supported.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
