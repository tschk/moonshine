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

See [docs/ROUTING.md](../../docs/ROUTING.md) and
[DESIGN.md](../../DESIGN.md).
