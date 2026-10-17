# `@tschk/moonshine-framework`

Public framework contracts shared by the router, compiler, server, renderers,
and deployment adapters.

```ts
import {
  defineConfig,
  defineRoute,
  MANIFEST_VERSION,
} from "@tschk/moonshine-framework";

const route = defineRoute({
  id: "home",
  path: "/",
  file: "src/routes/index.tsx",
});

const config = defineConfig({ runtime: "bun", mode: "auto" });
```

Native manifests support Bun, Node, Cloudflare, and Vercel Node functions. Route
runtimes match their adapter, with Vercel native functions using `node`. Vercel
Edge remains unsupported. Cloudflare and Vercel reject request context, islands,
and cache/revalidation options; see the [Cloudflare](../deploy-cloudflare/README.md)
and [Vercel](../deploy-vercel/README.md) adapter limits.

Exports include:

- `RouteDefinition`, `RenderMode`, `RuntimeTarget`
- `MoonshineManifest`, `RouteArtifact`, `MANIFEST_VERSION`
- `Renderer`, `RenderContext`, `DeploymentAdapter`
- `defineConfig`, `defineRoute`

See [docs/MANIFEST.md](../../docs/MANIFEST.md) and
[DESIGN.md](../../DESIGN.md).

Server request context is opt-in with `requestContext: true` and requires matching
Bun or Node deployment adapters and route runtimes. Import `runWithRequest` and
`getRequest` from `@tschk/moonshine-framework/request`; this server-only subpath
uses AsyncLocalStorage. The root export contains no request-context runtime.
`RequestScope` is available as a root type for pipeline integration.

Native page and layout server modules may export `metadata`, typed as `Metadata`:

```ts
import type { Metadata } from "@tschk/moonshine-framework";

export const metadata: Metadata = ({ data }) => ({
  title: (data as { title: string }).title,
  description: "A server-rendered page",
  lang: "en",
});
```

`DocumentMetadata` supports only `title`, `description`, and `lang`. Outer layouts,
inner layouts, then the page override individual fields. Undefined inherits; null
clears an inherited field (including the default `lang="en"`). Values are escaped
in the document head and HTML language attribute. Callbacks must be synchronous,
pure functions of the render context, which contains already-loaded route data;
Promises and invalid field types are rejected. No arbitrary head HTML is accepted.

Metadata applies to native SSR, static output, and SPA document shells without
mounting the SPA server component. API responses skip it. This adds no client head
manager: subsequent client-side navigation must update document metadata explicitly.
Legacy React rendering does not consume this export.
