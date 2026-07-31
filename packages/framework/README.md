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

Exports include:

- `RouteDefinition`, `RenderMode`, `RuntimeTarget`
- `MoonshineManifest`, `RouteArtifact`, `MANIFEST_VERSION`
- `Renderer`, `RenderContext`, `DeploymentAdapter`
- `defineConfig`, `defineRoute`

See [docs/MANIFEST.md](../../docs/MANIFEST.md) and
[DESIGN.md](../../DESIGN.md).
