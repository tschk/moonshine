# Deployment

Moonshine builds a versioned manifest and then invokes a deployment adapter.
Each adapter consumes the same manifest and compiled artifacts.

## Build output

`moonshine build` writes to `.moonshine/`:

- `manifest.json` — versioned route and asset metadata.
- `dist/server.js` — server bundle. It exports `modules` and, for the React
  and native renderers, the `renderer` bound to those modules; adapters render
  through it so a deployed bundle never re-imports route source files or loads
  a second copy of React.
- `public/client.js` — client bundle (when islands, SPAs or route-hydrated
  pages exist). It is minified and built with `process.env.NODE_ENV` set to
  `"production"`; `moonshine dev` (or `moonshine build --development`) keeps
  development builds.
- `server.ts` — adapter-specific entry file.

## Adapters

### Bun

`@tschk/moonshine-deploy-bun` is the reference adapter.

- Target: `bun` runtime.
- Capabilities: `streaming`, `islands`, `revalidation`.
- Output: a `server.ts` entry that calls `Bun.serve` with a request handler.
- Static files are served from the build directory.
- Limitations: requires the `Bun` global; does not run on Node.

### Node

`@tschk/moonshine-deploy-node` bridges the web-standard request handler to
`node:http`.

- Target: `node` runtime.
- Capabilities: `streaming`, `islands`, `revalidation`.
- Output: React builds with a compiler server bundle emit a self-contained
  `server.mjs`. Deploy it beside `public/` and run it with Node. Native builds
  emit `server.js`; manifests without a server bundle retain `server.ts`.
- Converts `IncomingMessage` / `ServerResponse` to `Request` / `Response` and
  back, including request cancellation through `AbortController`.
- Limitations: static files are served through `node:fs` read streams; does not
  use `Bun.file`.

### Cloudflare

`@tschk/moonshine-deploy-cloudflare` emits a Workers handler.

- Target: `cloudflare` runtime.
- Capabilities: `streaming`, `islands`, `edge`, `revalidation`.
- Output: a `server.ts` worker that imports `cloudflareFetch` and the manifest.
- Static assets are fetched through the `ASSETS` binding when present.
- Route matches are cached with the Cloudflare Cache API when a route defines a
  cache policy. Only opt in routes whose responses are public for every request.
  Requests with credentials and apps with `before` or `after` middleware bypass
  the cache.
  Responses with `Set-Cookie`, `Vary`, or private cache directives are not stored.
  Purge existing shared cache entries when deploying a change that makes a
  previously cached route private or request-dependent.
- Limitations:
  - Requires an `ASSETS` binding for static files.
  - Server modules are not resolved to absolute paths in the worker bundle.
  - `revalidation` depends on the Cloudflare cache API and plan limits.

#### Security upgrade: purge old shared entries

Workers built before the shared-cache fix in commit `36af08c` could store a
visitor-specific response and serve it to another visitor. The fix does not
remove entries that the old Worker already stored. Treat every response cached
by an affected Worker as potentially sensitive, including every path, hostname,
and query-string variant on every affected environment. A cache hit does not
prove whether the old response was public.

The operator must coordinate this procedure. Do not restore public traffic
between the deployment and the purge:

1. Restrict public traffic to every affected Worker and hostname, including
   alternate routes and preview or `workers.dev` endpoints. Stop old Worker
   versions from serving requests and allow in-flight requests and cache writes
   to finish. A purge while old versions still serve traffic can be repopulated.
2. Deploy the fixed Worker to every affected environment and confirm that no old
   version can receive traffic. Do not deploy a rollback that restores the old
   cache behavior.
3. In each affected Cloudflare zone, use **Purge Everything** to remove the
   zone's cached entries in all data centers. This also purges unrelated assets
   in that zone and can increase origin load. Purge other CDN or reverse-proxy
   caches that may have stored the responses as well. Do not rely on a single
   Worker's `cache.delete()`: it only affects the current data center.
4. Confirm the purge succeeded and test affected routes with separate visitor
   sessions before restoring public traffic. A purge API success confirms
   acceptance, not that any particular entry existed or was removed. If an
   endpoint is not covered by a zone-wide purge, keep it restricted until its
   cache can be invalidated globally or all potentially affected entries have
   expired. Do not assume a zone purge covers `workers.dev` or another zone.

Purge again after any rollback or other event that allowed an old Worker to
write cache entries. This procedure prevents reuse of old shared entries; it
does not determine whether information was disclosed before the purge.
See Cloudflare's [Cache API purge guidance](https://developers.cloudflare.com/workers/reference/how-the-cache-works/#purge-assets-stored-with-the-cache-api)
and [Purge Everything instructions](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-everything/).

### Vercel

`@tschk/moonshine-deploy-vercel` produces Vercel Build Output API v3.
`moonshine build` moves it to `.vercel/output` in the project root, where
Vercel reads it; set the Vercel project's framework to "Other" and its build
command to `moonshine build`.

- Target: the `node` runtime (the default for `--adapter vercel`).
- Capabilities: `streaming`, `islands`, `edge`.
- Output:
  - `.vercel/output/functions/moonshine.func/`: one Node function bundled
    from the server bundle, with every package inlined, so it runs without
    the project's sources or `node_modules`. It serves every route the
    filesystem does not.
  - `.vercel/output/static/`: public assets, the client bundle and CSS, and
    React `static` routes without params, prerendered through the same
    bundle (`about.html` is served at `/about` through `overrides`).
  - `.vercel/output/config.json`: `filesystem` first, then the function.
- Limitations:
  - React builds with a server bundle reject `vercel-edge` routes.
  - Static routes with params are rendered by the function on request.
  - `revalidation` is not a supported capability; routes that request it fail
    the build.

## Adapter selection

Use the `--adapter` flag or `moonshine.config.ts`:

```bash
moonshine build --adapter bun
moonshine build --adapter node
moonshine build --adapter cloudflare
moonshine build --adapter vercel
```

The default runtime for an adapter is `bun`, `node`, `cloudflare`, or `node`
respectively. Each route can override its runtime through
`RouteDefinition` or `moonshine.config.ts`.

## Conformance

`@tschk/moonshine-adapter-conformance` runs the same contract suite against
every adapter. A deployment adapter must expose a `DeploymentAdapter` with
`name`, `runtimes`, `capabilities`, and `build`. It must validate that every
route's runtime and the manifest's capabilities are supported before writing
output.

## Provider limits

| Provider   | Known constraints                                                         |
| ---------- | ------------------------------------------------------------------------- |
| Bun        | Requires Bun runtime.                                                     |
| Node       | `node:http` bridge adds a small overhead; no edge cache.                  |
| Cloudflare | Worker size limits, `ASSETS` binding, Cache API plan limits.              |
| Vercel     | Function count limits, edge runtime subset, no `revalidation` capability. |

See [MANIFEST.md](./MANIFEST.md) for the manifest schema and
[DESIGN.md](../DESIGN.md) for the request pipeline.
