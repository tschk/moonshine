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

See [docs/ROUTING.md](../../docs/ROUTING.md) and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
