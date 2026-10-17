# `@tschk/moonshine-compiler`

Filesystem route discovery, static analysis, bundling, and build manifest
output.

```ts
import { buildProject, discoverRoutes } from "@tschk/moonshine-compiler";

const manifest = await buildProject({
  projectDir: process.cwd(),
  runtime: "bun",
});

const routes = await discoverRoutes({
  routesDir: "./src/routes",
});
```

Features:

- `discoverRoutes` maps `src/routes` files to route patterns.
- `analyzeModule` reads source syntax to infer route facts.
- `classifyRoute` picks `static`, `ssr`, `island`, `spa`, or `api`.
- `buildProject` runs `Bun.build` and writes `.moonshine/manifest.json`.

Route analysis currently uses the TypeScript parser at build time. Source parsing
and lowering are intended to move to Crepuscularity once its module-analysis and
native DOM emission contracts cover these fixtures. This parser is not shipped
in native application artifacts; it remains a compiler dependency until then.

The optional `@tschk/moonshine-compiler/source` entry provides `emitCrepusSource`,
`readCrepusGraph` and `publishCrepusGraph`. It invokes an external Crepus compiler,
validates its module and asset inventory, and publishes unchanged compiler bytes
before atomically switching the public entry. This entry loads no TypeScript or
route-analysis code. The CLI uses the same implementation; automatic source
compilation inside `buildProject` remains unfinished.

Named HTTP exports dispatch the matching request method; `HEAD` falls back to
`GET`, and `OPTIONS` requires its own export. Unsupported methods return 405 with
an accurate `Allow` header. Explicit `loader`/`action` exports retain precedence;
a generic `handler` receives other methods unless an explicit `methods` list
restricts it. Separate data-file exports override the route's matching exports.

Native SPA routes receive separate browser entries with shared runtime chunks.
Imported browser CSS is linked from the corresponding route's document using
Bun's build metadata. Server modules remain excluded from browser entries.
Native server/SSR CSS imports are bundled into public route stylesheets, including
layout and transitive imports. CSS from dynamic imports is included eagerly.
Server styles precede browser styles when both exist; repeated roots are deduplicated.
Bun handles nested layers, media conditions and asset URLs. Unlinked browser CSS
byproducts may remain in build output after a unified stylesheet is generated.

See [docs/ROUTING.md](../../docs/ROUTING.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).

Native Bun builds use Bun server export conditions; native Node and Cloudflare builds use Node
conditions. Native routes in one build must share a runtime. The Node adapter
bundles its server entry for deployment without installed runtime packages.

`requestContext: true` bundles the server-only request runner with the routes, so
request helpers share one AsyncLocalStorage instance after bundling. It is opt-in,
supported on Bun/Node, and omitted from default and browser bundles. Edge targets
reject the option before removing the previous build.

Files in the project’s `public/` directory are copied into the build’s public
output and registered with SHA-256 integrity. They keep their names and root URLs
(with each URL segment encoded); `public/logo.svg` is served at `/logo.svg`.
Symlinks, overlapping source/output directories, and collisions with generated
files or manifest URLs fail the build. Output cleanup first checks that it cannot
remove project, route, or known module source files. Rebuilds remove stale assets.
