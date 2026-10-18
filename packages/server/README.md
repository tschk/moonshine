# `@tschk/moonshine-server`

Web-standard request pipeline: middleware, loaders, actions, error boundaries,
and static files.

```ts
import { createRequestHandler } from "@tschk/moonshine-server";

const fetch = createRequestHandler({
  manifest,
  modules,
  renderer: reactRenderer,
  staticDir: "./.moonshine/public",
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

## Opt-in route-data responses

Add `dataRequests: true` to your existing Bun/Node `moonshine.config.ts`, or pass
it to `createRequestHandler` from `@tschk/moonshine-server/data-http` in a
hand-written server. The ordinary server entry rejects enabled data requests;
its bundle omits the HTTP protocol implementation. The generated manifest carries this option into
Bun/Node deployment and preview handlers. Other build targets currently reject
it. For a TLS proxy, configure the expected public origin explicitly:

```ts
export default {
  dataRequests: { origin: "https://app.example" },
};
```

`true` checks against the request URL's origin. The object form checks against
its validated public origin; forwarding headers do not select the trusted origin.
Neither form rewrites the request URL. Requests with a mismatched/malformed
`Origin`, or cross-site/same-site fetch metadata without an origin, reject before
request scope, middleware or route callbacks run. Nonbrowser requests without
those headers remain supported. Existing document/API/webhook requests retain
their ordinary behavior.

This checks browser request origin, not user authorization or accepted server
hostnames. Deployments must validate their accepted Host values; use application
authentication before returning private loader data.

The opt-in request header is `x-moonshine-data: 1`:

| Method                      | Protocol response                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET / HEAD                  | Existing parallel loaders; `{ data: context.data }`; no page renderer. HEAD has no body.                       |
| POST / PUT / PATCH / DELETE | Leaf action only; `{ data: actionResult }`; no loaders. A client data router reloads separately after success. |

Core envelopes carry the version header and `application/json`. Values use plain
JSON semantics; an undefined action result becomes `null`. Loader/action metadata,
cookies, after middleware and request scope retain their response behavior.
Statuses 204/205 have no body and decode as `null` in the native client. Direct or
thrown `Response` values, redirects and error boundaries remain native HTTP.
Return JSON-compatible values to use the protocol. The entire loader-data map is
client-visible when requested, so keep private server values out of its results.

Enabled handlers add `Vary: x-moonshine-data` to both document and data responses,
preserving existing tokens and wildcard values. Protocol requests bypass static
HTML shortcuts; cache policy remains application-owned. Normal requests without
the exact protocol header keep their existing rendering and action/loader flow.
The optional [HTTP client](../router/README.md#optional-http-route-data) keeps
server modules out of browser bundles.
