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

Native manifests support only the Node runtime. The adapter bundles one standalone
Node 22 function (`index.mjs`) containing the native renderer and route modules.
Build Output filesystem routing serves public client assets first, then sends
requests through the complete loader/action/middleware pipeline, including routes
marked static. No React or Solid runtime is included. For native builds, only files within the build's `public` directory can enter
Vercel static output. Legacy explicit external asset registrations remain supported,
while the build's `dist` directory and registered server entry are excluded.

Native Edge, request context, islands/hydration, and cache/revalidation options are
rejected. Local acceptance runs the relocated function under actual Node HTTP with
a small filesystem-routing harness; this does not emulate Vercel infrastructure
or establish a public deployment. Legacy rendering requires the optional
`@tschk/moonshine-react` peer.
