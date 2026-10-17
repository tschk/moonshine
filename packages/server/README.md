# `@tschk/moonshine-server`

Web-standard request pipeline: middleware, loaders, actions, error boundaries,
and static files.

```ts
import { createRequestHandler } from "@tschk/moonshine-server";

const fetch = createRequestHandler({
  manifest,
  modules,
  renderer: reactRenderer,
  staticDir: "./.moonshine",
});

Bun.serve({ fetch });
```

Features:

- `createRequestHandler` matches routes and runs the full pipeline.
- Loaders and actions receive `RouteContext` with `request`, `params`, `signal`,
  and `data`.
- `redirect`, `json`, `errorResponse` helpers.
- `serializeData` escapes HTML-sensitive characters and rejects cycles.
- `resolveStaticPath` / `tryServeStatic` for static file serving.

Ordinary headers use the last source value. `Set-Cookie` fields accumulate
separately across default, layout, route and response headers, including HEAD
responses; provide repeated cookies as a `Headers` instance or header tuples.

See [docs/ROUTING.md](../../docs/ROUTING.md) and
[DESIGN.md](../../DESIGN.md).

For an opt-in request-context build, pass the compiled server bundle's
`requestScope` to `createRequestHandler` alongside its `modules`. Deployment and
preview do this automatically when the manifest enables `requestContext`.
The server package itself does not import AsyncLocalStorage.
