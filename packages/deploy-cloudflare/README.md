# `@tschk/moonshine-deploy-cloudflare`

Cloudflare Workers deployment adapter for Moonshine.

```ts
import { cloudflareAdapter } from "@tschk/moonshine-deploy-cloudflare";

await cloudflareAdapter.build(manifest, ".moonshine");
```

- Target runtime: `cloudflare`.
- Capabilities: `streaming`, `islands`, `edge`, `revalidation`.
- `cache.revalidate` is ignored, by design, on routes with `before` middleware;
  see [Caching and revalidation](../../docs/DEPLOYMENT.md#revalidate-does-not-apply-to-routes-with-before-middleware).
- Output: a bundled `server.js` Worker and `wrangler.jsonc`. The Worker uses
  the Cloudflare Cache API for routes with a `cache` policy and an `ASSETS`
  binding for files in `public/`. Run it with
  `wrangler dev --local --config .moonshine/wrangler.jsonc`.

Limitations: requires an `ASSETS` binding for static files; worker size and
Cache API limits apply.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).

Native apps use `renderer: "native"`, `runtime: "cloudflare"`, and
`adapter: "cloudflare"`. The adapter emits a bundled `server.js`, public assets,
and `wrangler.jsonc`. Run the generated artifact locally with an installed
Wrangler:

```bash
wrangler dev --local --config .moonshine/wrangler.jsonc
```

The native worker uses the bundled module table and independent renderer, without
React, Solid, a global module registry, or source-file imports. SSR, static output,
API routes and SPA routes with explicit `clientFile` use this path. Public files
are served through the `ASSETS` binding. The generated config invokes the worker
first, enables Node compatibility for shared server imports, and uses the build
date as its compatibility date. A recent Wrangler/workerd is required; older local
runtimes may require an isolated test configuration with an older supported date.

Native hydration/islands, opt-in request context, and route caching/revalidation
are rejected explicitly. The legacy `cloudflareFetch` helper and React renderer
remain available for existing apps; native apps use the generated worker.

The optional native artifact test discovers an existing Wrangler/Miniflare
installation and runs real workerd. It skips when that tool is unavailable and
does not install it. The installed 2026-06-16 emulator baseline was verified with
explicit Node compatibility; this does not establish production deployment.
