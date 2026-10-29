# Deployment

Moonshine builds a versioned manifest and then invokes a deployment adapter.
Each adapter consumes the same manifest and compiled artifacts.

## Build output

`moonshine build` writes to `.moonshine/`:

- `manifest.json` — versioned route and asset metadata.
- `dist/server.js` — server bundle of the app's route modules. Packages stay
  external so the adapter's bundle holds one copy of React and of the server
  runtime.
- `public/` — client bundles and public files.
- `server.ts` — adapter-specific entry file. The Node, Cloudflare and Vercel
  adapters bundle it, with every dependency, into self-contained output that
  runs without Bun, a TypeScript loader, `node_modules`, or the source tree.

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
- Output: `server.js`, one bundled ES module using `createServer` and
  `createNodeHandler`. Deploy it beside `public/` and run `node server.js`
  (`PORT` selects the port).
- Converts `IncomingMessage` / `ServerResponse` to `Request` / `Response` and
  back, including request cancellation through `AbortController`.
- Limitations: static files are served through `node:fs` read streams; does not
  use `Bun.file`.

### Cloudflare

`@tschk/moonshine-deploy-cloudflare` emits a Workers handler.

- Target: `cloudflare` runtime.
- Capabilities: `streaming`, `islands`, `edge`, `revalidation`.
- Output: `server.js`, one bundled Worker module, plus `wrangler.jsonc` (with
  `nodejs_compat` and the `ASSETS` binding on `./public`).
- Static assets are fetched through the `ASSETS` binding when present.
- Route matches are cached with the Cloudflare Cache API when a route defines a
  cache policy.
- Limitations:
  - Requires an `ASSETS` binding for static files.
  - Cached routes are also stored with the Cache API, which honours the
    `s-maxage` that `cache.revalidate` sets; Cache API plan limits apply.

### Vercel

`@tschk/moonshine-deploy-vercel` produces a Vercel build output.

- Target: `node` or `vercel-edge` runtime per route.
- Capabilities: `streaming`, `islands`, `edge`.
- Output:
  - `.vercel/output/static/` for public files and prerendered `static`
    routes. Prerendering requests each route from the built Node function, so
    the HTML includes loader data.
  - `.vercel/output/functions/moonshine.func/` — one bundled Node 22 function
    for every Node route and for unmatched paths.
  - `.vercel/output/functions/moonshine-edge.func/` — one bundled Edge function
    for `vercel-edge` routes, when there are any.
  - `.vercel/output/config.json` — filesystem first, then prerendered and Edge
    routes, then the Node function.
- Limitations:
  - Static routes with parameters are not pre-rendered.
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

## Caching and revalidation

A route's `cache` option, set on its entry in `moonshine.config.ts` `routes`,
applies on every adapter through the shared request pipeline:

- `control` is sent as `Cache-Control` on successful GET and HEAD responses
  that do not set their own `Cache-Control` or a cookie.
- `revalidate: n` reuses a rendered response, per URL including the query, for
  `n` seconds; the first request after that renders it again. Without
  `control`, the response advertises `public, max-age=0, s-maxage=n` to shared
  caches. Responses that set cookies, non-200 responses, route-data
  requests, and apps with `requestContext` are never reused. The cache lives in the server process (or Worker
  isolate) and holds at most 500 pages.

Routes with `revalidate` add the `revalidation` capability, which Bun, Node and
Cloudflare support. The Vercel and native Cloudflare/Vercel builds reject it.

## Conformance

`@tschk/moonshine-adapter-conformance` runs the same contract suite against
every adapter. `adapterConformance` checks the request handler bridge in
process. `artifactConformance` builds a React fixture app with
`moonshine build --adapter <name>` and runs the output on the adapter's own
runtime: Bun for Bun, plain Node for Node, workerd (through Miniflare) for
Cloudflare, and a Build Output API host running Node functions in Node and Edge
functions in workerd for Vercel. Node, Cloudflare and Vercel artifacts are first
copied away from the project and checked for unbundled imports. A deployment adapter must expose a `DeploymentAdapter` with
`name`, `runtimes`, `capabilities`, and `build`. It must validate that every
route's runtime and the manifest's capabilities are supported before writing
output.

## Provider limits

| Provider   | Known constraints                                                        |
| ---------- | ------------------------------------------------------------------------ |
| Bun        | Requires Bun runtime.                                                    |
| Node       | `node:http` bridge adds a small overhead; no edge cache.                 |
| Cloudflare | Worker size limits, `ASSETS` binding, Cache API plan limits.             |
| Vercel     | Function size limits, edge runtime subset, no `revalidation` capability. |

See [MANIFEST.md](./MANIFEST.md) for the manifest schema and
[DESIGN.md](../DESIGN.md) for the request pipeline.
