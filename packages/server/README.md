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

With an opt-in request scope, `getResponseHeaders()` from
`@tschk/moonshine-framework/request` returns the request's mutable response-header
sink. The pipeline merges it into completed responses, including redirects,
errors, not-found and HEAD responses. Explicit response headers win for ordinary
fields; `Set-Cookie` fields append separately. Without a supplied sink the helper
returns `undefined`. Custom scope wrappers must forward the optional third
`responseHeaders` argument to `runWithRequest`. The signal-only root is unchanged.

Loader/action results implementing the framework `RouteData` contract retain
payload identity while carrying rendered response status and headers. The
React Router adapter's `data()` produces this contract. Layout-to-page loader
metadata merges in route order, with explicit action metadata taking precedence;
`after` middleware sees the resulting response and can replace it. Statuses 204,
205 and 304 discard rendered bodies. Direct or thrown `Response` values keep
precedence, and throwing a data wrapper is unsupported. Ordinary objects are
unchanged; `type: "DataWithResponseInit"` together with own `data` and an `init`
object is reserved for this contract.
