# Deployment

Moonshine builds a versioned manifest and then invokes a deployment adapter.
Each adapter consumes the same manifest and compiled artifacts.

## Build output

`moonshine build` writes to `.moonshine/`:

- `manifest.json` — versioned route and asset metadata.
- `dist/server.js` — server bundle.
- `dist/client.js` — client bundle (when islands or SPAs exist).
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
- Output: a `server.ts` entry using `createServer` and `createNodeHandler`.
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
  cache policy.
- Limitations:
  - Requires an `ASSETS` binding for static files.
  - Server modules are not resolved to absolute paths in the worker bundle.
  - `revalidation` depends on the Cloudflare cache API and plan limits.

### Vercel

`@tschk/moonshine-deploy-vercel` produces a Vercel build output.

- Target: `node` or `vercel-edge` runtime per route.
- Capabilities: `streaming`, `islands`, `edge`.
- Output:
  - `.vercel/output/static/` for prerendered `static` routes.
  - `.vercel/output/functions/<id>.func/` for server/edge routes.
  - `.vercel/output/config.json` with regex route matching.
- Limitations:
  - Static routes with rest parameters are not pre-rendered.
  - Each non-static route becomes a separate function directory.
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

The default runtime for an adapter is `bun`, `node`, `cloudflare`, or
`vercel-edge` respectively. Each route can override its runtime through
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
