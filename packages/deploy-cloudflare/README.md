# `@tschk/moonshine-deploy-cloudflare`

Cloudflare Workers deployment adapter for Moonshine.

```ts
import { cloudflareAdapter } from "@tschk/moonshine-deploy-cloudflare";

await cloudflareAdapter.build(manifest, ".moonshine");
```

- Target runtime: `cloudflare`.
- Capabilities: `streaming`, `islands`, `edge`, `revalidation` (route cache
  storage is disabled as described below).
- Compiler builds output a bundled `server.js`, `public/` assets and
  `wrangler.jsonc`. The React worker uses an `ASSETS` binding for static files.
  Legacy manifests without a compiler server
  bundle still emit `server.ts` and require a separate bundling step.

Limitations: requires an `ASSETS` binding for static files; worker size limits
apply.

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
are rejected explicitly. React builds use the compiler's module table and renderer
through `cloudflareFetch`. It does not read or write the shared Cache API:
loaders can personalize responses using arbitrary request data even without a
`Vary` header. For routes declaring a cache policy, dynamic responses instead
receive `Cache-Control: private, no-store`, sacrificing shared caching until an
explicit safe contract exists. Asset binding responses retain their own headers.
This change does not purge entries already stored by previous deployments or
override separately configured caching rules.

The optional native artifact test discovers an existing Wrangler/Miniflare
installation and runs real workerd. It skips when that tool is unavailable and
does not install it. The installed 2026-06-16 emulator baseline was verified with
explicit Node compatibility; this does not establish production deployment.
